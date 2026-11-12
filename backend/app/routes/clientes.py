from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select, col
from pydantic import BaseModel

from app.database import get_session
from app.models.cliente import Cliente, Divida, PagamentoDivida
from app.models.financeiro import (
    MovimentacaoFinanceira,
    TipoFinanceiro,
    CategoriaEntrada,
)
from app.models.produto import Produto, MovimentacaoEstoque, TipoMovimentacao

router = APIRouter(prefix="/api/clientes", tags=["clientes"])


# --- DTOs ---

class ClienteCreate(BaseModel):
    nome: str
    telefone: str | None = None


class ClienteUpdate(BaseModel):
    nome: str | None = None
    telefone: str | None = None


class DividaCreate(BaseModel):
    descricao: str
    valor_total: float
    produto_id: int | None = None
    quantidade: int | None = None


class DividaUpdate(BaseModel):
    descricao: str | None = None
    valor_total: float | None = None


class PagamentoCreate(BaseModel):
    valor: float


class PagamentoUpdate(BaseModel):
    valor: float


# Tolerância para comparações de dinheiro (evita 99.99999 != 100.0)
EPS = 0.005


def _recalcular_quitada(divida: Divida) -> None:
    divida.quitada = divida.valor_pago >= divida.valor_total - EPS
    divida.updated_at = datetime.now()


def _aplicar_pagamento(
    session: Session, divida: Divida, nome_cliente: str, valor: float
) -> PagamentoDivida:
    """Registra um pagamento numa dívida e o lançamento correspondente no caixa.

    Não faz commit: quem chama decide a transação.
    """
    divida.valor_pago += valor
    _recalcular_quitada(divida)

    mov = MovimentacaoFinanceira(
        tipo=TipoFinanceiro.ENTRADA,
        categoria=CategoriaEntrada.RECEBIMENTO_DIVIDA.value,
        descricao=f"Recebimento fiado — {nome_cliente}: {divida.descricao}",
        valor=valor,
    )
    session.add(mov)
    session.flush()  # garante mov.id

    pagamento = PagamentoDivida(divida_id=divida.id, valor=valor, movimentacao_id=mov.id)
    session.add(divida)
    session.add(pagamento)
    return pagamento


# --- Clientes ---

@router.get("")
def listar_clientes(
    busca: str | None = Query(None),
    session: Session = Depends(get_session),
):
    query = select(Cliente)
    if busca:
        query = query.where(col(Cliente.nome).ilike(f"%{busca}%"))
    query = query.order_by(Cliente.nome)
    return session.exec(query).all()


@router.get("/{cliente_id}")
def obter_cliente(cliente_id: int, session: Session = Depends(get_session)):
    cliente = session.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


@router.post("", status_code=201)
def criar_cliente(data: ClienteCreate, session: Session = Depends(get_session)):
    cliente = Cliente(**data.model_dump())
    session.add(cliente)
    session.commit()
    session.refresh(cliente)
    return cliente


@router.put("/{cliente_id}")
def atualizar_cliente(
    cliente_id: int, data: ClienteUpdate, session: Session = Depends(get_session)
):
    cliente = session.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(cliente, key, value)
    session.add(cliente)
    session.commit()
    session.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}")
def deletar_cliente(cliente_id: int, session: Session = Depends(get_session)):
    cliente = session.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    # Deletar dívidas e pagamentos associados
    dividas = session.exec(select(Divida).where(Divida.cliente_id == cliente_id)).all()
    for divida in dividas:
        pagamentos = session.exec(
            select(PagamentoDivida).where(PagamentoDivida.divida_id == divida.id)
        ).all()
        for p in pagamentos:
            session.delete(p)
        session.delete(divida)
    session.delete(cliente)
    session.commit()
    return {"ok": True}


# --- Dívidas ---

@router.get("/{cliente_id}/dividas")
def listar_dividas(
    cliente_id: int,
    quitadas: bool | None = Query(None),
    session: Session = Depends(get_session),
):
    query = select(Divida).where(Divida.cliente_id == cliente_id)
    if quitadas is not None:
        query = query.where(Divida.quitada == quitadas)
    query = query.order_by(col(Divida.created_at).desc())
    return session.exec(query).all()


@router.post("/{cliente_id}/dividas", status_code=201)
def criar_divida(
    cliente_id: int, data: DividaCreate, session: Session = Depends(get_session)
):
    cliente = session.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    # Venda fiado de item do estoque: baixa a quantidade e registra a movimentação
    if data.produto_id and data.quantidade:
        produto = session.get(Produto, data.produto_id)
        if not produto:
            raise HTTPException(status_code=404, detail="Produto não encontrado")
        if produto.quantidade < data.quantidade:
            raise HTTPException(
                status_code=400,
                detail=f"Estoque insuficiente ({produto.quantidade} disponível)",
            )
        produto.quantidade -= data.quantidade
        produto.updated_at = datetime.now()
        session.add(produto)
        session.add(
            MovimentacaoEstoque(
                produto_id=data.produto_id,
                tipo=TipoMovimentacao.SAIDA,
                quantidade=data.quantidade,
                observacao=f"Venda fiado — {cliente.nome}: {data.descricao}",
            )
        )

    divida = Divida(
        cliente_id=cliente_id,
        descricao=data.descricao,
        valor_total=data.valor_total,
    )
    session.add(divida)
    session.commit()
    session.refresh(divida)
    return divida


@router.put("/dividas/{divida_id}")
def atualizar_divida(
    divida_id: int, data: DividaUpdate, session: Session = Depends(get_session)
):
    divida = session.get(Divida, divida_id)
    if not divida:
        raise HTTPException(status_code=404, detail="Dívida não encontrada")

    if data.descricao is not None:
        if not data.descricao.strip():
            raise HTTPException(status_code=400, detail="Descrição não pode ser vazia")
        divida.descricao = data.descricao.strip()

    if data.valor_total is not None:
        if data.valor_total <= 0:
            raise HTTPException(status_code=400, detail="Valor total deve ser maior que zero")
        if data.valor_total < divida.valor_pago - EPS:
            raise HTTPException(
                status_code=400,
                detail=f"Valor total não pode ser menor que o já pago (R$ {divida.valor_pago:.2f})",
            )
        divida.valor_total = data.valor_total

    _recalcular_quitada(divida)
    session.add(divida)
    session.commit()
    session.refresh(divida)
    return divida


@router.delete("/dividas/{divida_id}")
def deletar_divida(divida_id: int, session: Session = Depends(get_session)):
    divida = session.get(Divida, divida_id)
    if not divida:
        raise HTTPException(status_code=404, detail="Dívida não encontrada")
    pagamentos = session.exec(
        select(PagamentoDivida).where(PagamentoDivida.divida_id == divida_id)
    ).all()
    for p in pagamentos:
        session.delete(p)
    session.delete(divida)
    session.commit()
    return {"ok": True}


# --- Pagamentos ---

@router.get("/dividas/{divida_id}/pagamentos")
def listar_pagamentos(divida_id: int, session: Session = Depends(get_session)):
    if not session.get(Divida, divida_id):
        raise HTTPException(status_code=404, detail="Dívida não encontrada")
    query = (
        select(PagamentoDivida)
        .where(PagamentoDivida.divida_id == divida_id)
        .order_by(col(PagamentoDivida.created_at).desc())
    )
    return session.exec(query).all()


@router.post("/dividas/{divida_id}/pagamento", status_code=201)
def registrar_pagamento(
    divida_id: int, data: PagamentoCreate, session: Session = Depends(get_session)
):
    divida = session.get(Divida, divida_id)
    if not divida:
        raise HTTPException(status_code=404, detail="Dívida não encontrada")
    if divida.quitada:
        raise HTTPException(status_code=400, detail="Dívida já quitada")
    if data.valor <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")

    restante = divida.valor_total - divida.valor_pago
    if data.valor > restante + EPS:
        raise HTTPException(
            status_code=400,
            detail=f"Valor excede o restante (R$ {restante:.2f})",
        )

    cliente = session.get(Cliente, divida.cliente_id)
    nome_cliente = cliente.nome if cliente else "Cliente"
    _aplicar_pagamento(session, divida, nome_cliente, min(data.valor, restante))
    session.commit()
    session.refresh(divida)
    return divida


@router.post("/{cliente_id}/pagamento", status_code=201)
def pagar_cliente(
    cliente_id: int, data: PagamentoCreate, session: Session = Depends(get_session)
):
    """Pagamento no nível do cliente: abate o valor das dívidas em aberto,
    da mais antiga para a mais nova. Permite quitar tudo de uma vez."""
    cliente = session.get(Cliente, cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    if data.valor <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")

    abertas = session.exec(
        select(Divida)
        .where(Divida.cliente_id == cliente_id, Divida.quitada == False)  # noqa: E712
        .order_by(col(Divida.created_at).asc(), col(Divida.id).asc())
    ).all()
    if not abertas:
        raise HTTPException(status_code=400, detail="Cliente não tem dívidas em aberto")

    restante_total = sum(d.valor_total - d.valor_pago for d in abertas)
    if data.valor > restante_total + EPS:
        raise HTTPException(
            status_code=400,
            detail=f"Valor excede o total em aberto (R$ {restante_total:.2f})",
        )

    sobra = min(data.valor, restante_total)
    dividas_pagas = 0
    for d in abertas:
        if sobra <= EPS:
            break
        restante = d.valor_total - d.valor_pago
        parcela = min(sobra, restante)
        _aplicar_pagamento(session, d, cliente.nome, parcela)
        sobra -= parcela
        dividas_pagas += 1

    session.commit()
    return {
        "ok": True,
        "valor_aplicado": round(data.valor - max(sobra, 0.0), 2),
        "dividas_afetadas": dividas_pagas,
        "restante_cliente": round(max(restante_total - data.valor, 0.0), 2),
    }


@router.put("/dividas/pagamentos/{pagamento_id}")
def atualizar_pagamento(
    pagamento_id: int, data: PagamentoUpdate, session: Session = Depends(get_session)
):
    pagamento = session.get(PagamentoDivida, pagamento_id)
    if not pagamento:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")
    if data.valor <= 0:
        raise HTTPException(status_code=400, detail="Valor deve ser maior que zero")

    divida = session.get(Divida, pagamento.divida_id)
    if not divida:
        raise HTTPException(status_code=404, detail="Dívida não encontrada")

    novo_pago = divida.valor_pago - pagamento.valor + data.valor
    if novo_pago > divida.valor_total + EPS:
        maximo = divida.valor_total - (divida.valor_pago - pagamento.valor)
        raise HTTPException(
            status_code=400,
            detail=f"Valor excede o total da dívida (máximo R$ {maximo:.2f})",
        )

    pagamento.valor = data.valor
    divida.valor_pago = novo_pago
    _recalcular_quitada(divida)

    if pagamento.movimentacao_id:
        mov = session.get(MovimentacaoFinanceira, pagamento.movimentacao_id)
        if mov:
            mov.valor = data.valor
            session.add(mov)

    session.add(pagamento)
    session.add(divida)
    session.commit()
    session.refresh(pagamento)
    return pagamento


@router.delete("/dividas/pagamentos/{pagamento_id}")
def deletar_pagamento(pagamento_id: int, session: Session = Depends(get_session)):
    pagamento = session.get(PagamentoDivida, pagamento_id)
    if not pagamento:
        raise HTTPException(status_code=404, detail="Pagamento não encontrado")

    divida = session.get(Divida, pagamento.divida_id)
    if divida:
        divida.valor_pago = max(divida.valor_pago - pagamento.valor, 0.0)
        _recalcular_quitada(divida)
        session.add(divida)

    if pagamento.movimentacao_id:
        mov = session.get(MovimentacaoFinanceira, pagamento.movimentacao_id)
        if mov:
            session.delete(mov)

    session.delete(pagamento)
    session.commit()
    return {"ok": True}
