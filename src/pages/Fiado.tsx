import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Check,
  Receipt,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageLoader } from "@/components/PageLoader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ProductPicker } from "@/components/ProductPicker";

interface Cliente {
  id: number;
  nome: string;
  telefone: string | null;
}

interface Produto {
  id: number;
  nome: string;
  categoria: string;
  quantidade: number;
  preco_venda: number;
}

interface Divida {
  id: number;
  cliente_id: number;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  quitada: boolean;
  created_at: string;
}

interface Pagamento {
  id: number;
  divida_id: number;
  valor: number;
  created_at: string;
}

const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

export default function FiadoPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const firstLoad = useRef(true);
  const [expandido, setExpandido] = useState<number | null>(null);
  const [dividas, setDividas] = useState<Divida[]>([]);

  // Dialogs
  const [clienteDialogOpen, setClienteDialogOpen] = useState(false);
  const [dividaDialogOpen, setDividaDialogOpen] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [editingClienteId, setEditingClienteId] = useState<number | null>(null);
  const [selectedClienteId, setSelectedClienteId] = useState<number | null>(
    null
  );
  const [selectedDividaId, setSelectedDividaId] = useState<number | null>(null);
  const [selectedDividaRestante, setSelectedDividaRestante] = useState(0);

  const [clienteForm, setClienteForm] = useState({ nome: "", telefone: "" });
  const [dividaForm, setDividaForm] = useState({
    descricao: "",
    valor_total: 0,
    produto_id: null as number | null,
    quantidade: 1,
  });
  const [usarEstoque, setUsarEstoque] = useState(false);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [pagamentoValor, setPagamentoValor] = useState(0);
  const [confirmDeleteCliente, setConfirmDeleteCliente] = useState<number | null>(null);
  const [confirmDeleteDivida, setConfirmDeleteDivida] = useState<number | null>(null);

  // Edição de dívida
  const [editDividaOpen, setEditDividaOpen] = useState(false);
  const [editDivida, setEditDivida] = useState<Divida | null>(null);
  const [editDividaForm, setEditDividaForm] = useState({ descricao: "", valor_total: 0 });

  // Histórico de pagamentos de uma dívida (expandido inline)
  const [pagamentosDe, setPagamentosDe] = useState<number | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [editPagamento, setEditPagamento] = useState<Pagamento | null>(null);
  const [editPagamentoValor, setEditPagamentoValor] = useState(0);
  const [confirmDeletePagamento, setConfirmDeletePagamento] = useState<number | null>(null);

  // Pagamento no nível do cliente (abate das dívidas mais antigas primeiro)
  const [pagClienteOpen, setPagClienteOpen] = useState(false);
  const [pagClienteValor, setPagClienteValor] = useState(0);

  const carregarClientes = useCallback(async () => {
    try {
      const params = busca ? `?busca=${encodeURIComponent(busca)}` : "";
      const data = await api.get<Cliente[]>(`/clientes${params}`);
      setClientes(data);
    } catch {
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, [busca]);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      carregarClientes();
      return;
    }
    const timer = setTimeout(carregarClientes, 300);
    return () => clearTimeout(timer);
  }, [carregarClientes]);

  async function carregarDividas(clienteId: number) {
    try {
      const data = await api.get<Divida[]>(`/clientes/${clienteId}/dividas`);
      setDividas(data);
      if (pagamentosDe !== null) {
        if (data.some((d) => d.id === pagamentosDe)) carregarPagamentos(pagamentosDe);
        else {
          setPagamentosDe(null);
          setPagamentos([]);
        }
      }
    } catch {
      toast.error("Erro ao carregar dívidas");
    }
  }

  function toggleExpandir(clienteId: number) {
    setPagamentosDe(null);
    setPagamentos([]);
    if (expandido === clienteId) {
      setExpandido(null);
      setDividas([]);
    } else {
      setExpandido(clienteId);
      carregarDividas(clienteId);
    }
  }

  async function carregarPagamentos(dividaId: number) {
    try {
      const data = await api.get<Pagamento[]>(`/clientes/dividas/${dividaId}/pagamentos`);
      setPagamentos(data);
    } catch {
      toast.error("Erro ao carregar pagamentos");
    }
  }

  function togglePagamentos(dividaId: number) {
    if (pagamentosDe === dividaId) {
      setPagamentosDe(null);
      setPagamentos([]);
    } else {
      setPagamentosDe(dividaId);
      carregarPagamentos(dividaId);
    }
  }

  // --- Clientes ---
  function abrirNovoCliente() {
    setEditingClienteId(null);
    setClienteForm({ nome: "", telefone: "" });
    setClienteDialogOpen(true);
  }

  function abrirEditarCliente(c: Cliente) {
    setEditingClienteId(c.id);
    setClienteForm({ nome: c.nome, telefone: c.telefone || "" });
    setClienteDialogOpen(true);
  }

  async function salvarCliente() {
    if (!clienteForm.nome) {
      toast.error("Informe o nome do cliente");
      return;
    }
    try {
      const payload = {
        ...clienteForm,
        telefone: clienteForm.telefone || null,
      };
      if (editingClienteId) {
        await api.put(`/clientes/${editingClienteId}`, payload);
        toast.success("Cliente atualizado");
      } else {
        await api.post("/clientes", payload);
        toast.success("Cliente cadastrado");
      }
      setClienteDialogOpen(false);
      carregarClientes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function deletarCliente(id: number) {
    try {
      await api.delete(`/clientes/${id}`);
      toast.success("Cliente excluído");
      if (expandido === id) setExpandido(null);
      carregarClientes();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  // --- Dívidas ---
  async function abrirNovaDivida(clienteId: number) {
    setSelectedClienteId(clienteId);
    setDividaForm({ descricao: "", valor_total: 0, produto_id: null, quantidade: 1 });
    setUsarEstoque(false);
    setDividaDialogOpen(true);
    try {
      const prods = await api.get<Produto[]>("/produtos");
      setProdutos(prods);
    } catch {
      setProdutos([]);
    }
  }

  function selecionarProduto(produtoId: number | null) {
    if (produtoId === null) {
      setDividaForm({ ...dividaForm, produto_id: null });
      return;
    }
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;
    const qtd = dividaForm.quantidade || 1;
    setDividaForm({
      ...dividaForm,
      produto_id: produtoId,
      descricao: produto.nome,
      valor_total: produto.preco_venda * qtd,
    });
  }

  function atualizarQuantidade(qtd: number) {
    const produto = produtos.find((p) => p.id === dividaForm.produto_id);
    setDividaForm({
      ...dividaForm,
      quantidade: qtd,
      valor_total: produto ? produto.preco_venda * qtd : dividaForm.valor_total,
    });
  }

  async function salvarDivida() {
    if (!dividaForm.descricao || dividaForm.valor_total <= 0) {
      toast.error("Preencha descrição e valor");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        descricao: dividaForm.descricao,
        valor_total: dividaForm.valor_total,
      };
      if (usarEstoque && dividaForm.produto_id) {
        payload.produto_id = dividaForm.produto_id;
        payload.quantidade = dividaForm.quantidade;
      }
      await api.post(`/clientes/${selectedClienteId}/dividas`, payload);
      toast.success("Dívida registrada");
      setDividaDialogOpen(false);
      if (selectedClienteId) carregarDividas(selectedClienteId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function deletarDivida(dividaId: number) {
    try {
      await api.delete(`/clientes/dividas/${dividaId}`);
      toast.success("Dívida excluída");
      if (expandido) carregarDividas(expandido);
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  // --- Pagamentos ---
  function abrirPagamento(divida: Divida) {
    setSelectedDividaId(divida.id);
    const restante = divida.valor_total - divida.valor_pago;
    setSelectedDividaRestante(restante);
    setPagamentoValor(0);
    setPagamentoDialogOpen(true);
  }

  async function registrarPagamento(valor?: number) {
    const valorFinal = valor ?? pagamentoValor;
    if (valorFinal <= 0) {
      toast.error("Informe um valor");
      return;
    }
    try {
      await api.post(`/clientes/dividas/${selectedDividaId}/pagamento`, {
        valor: valorFinal,
      });
      toast.success("Pagamento registrado");
      setPagamentoDialogOpen(false);
      if (expandido) carregarDividas(expandido);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  function abrirEditarDivida(d: Divida) {
    setEditDivida(d);
    setEditDividaForm({ descricao: d.descricao, valor_total: d.valor_total });
    setEditDividaOpen(true);
  }

  async function salvarEdicaoDivida() {
    if (!editDivida) return;
    if (!editDividaForm.descricao.trim() || editDividaForm.valor_total <= 0) {
      toast.error("Preencha descrição e valor");
      return;
    }
    try {
      await api.put(`/clientes/dividas/${editDivida.id}`, editDividaForm);
      toast.success("Dívida atualizada");
      setEditDividaOpen(false);
      if (expandido) carregarDividas(expandido);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  function abrirEditarPagamento(p: Pagamento) {
    setEditPagamento(p);
    setEditPagamentoValor(p.valor);
  }

  async function salvarEdicaoPagamento() {
    if (!editPagamento) return;
    if (editPagamentoValor <= 0) {
      toast.error("Informe um valor");
      return;
    }
    try {
      await api.put(`/clientes/dividas/pagamentos/${editPagamento.id}`, {
        valor: editPagamentoValor,
      });
      toast.success("Pagamento atualizado");
      setEditPagamento(null);
      if (expandido) carregarDividas(expandido);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function deletarPagamento(pagamentoId: number) {
    try {
      await api.delete(`/clientes/dividas/pagamentos/${pagamentoId}`);
      toast.success("Pagamento excluído");
      if (expandido) carregarDividas(expandido);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  function abrirPagamentoCliente() {
    setPagClienteValor(0);
    setPagClienteOpen(true);
  }

  async function pagarCliente(valor?: number) {
    if (!expandido) return;
    const valorFinal = valor ?? pagClienteValor;
    if (valorFinal <= 0) {
      toast.error("Informe um valor");
      return;
    }
    try {
      const r = await api.post<{ dividas_afetadas: number; restante_cliente: number }>(
        `/clientes/${expandido}/pagamento`,
        { valor: valorFinal }
      );
      toast.success(
        r.restante_cliente <= 0
          ? "Todas as dívidas foram quitadas"
          : `Pagamento aplicado em ${r.dividas_afetadas} dívida(s). Restante: ${fmt(r.restante_cliente)}`
      );
      setPagClienteOpen(false);
      carregarDividas(expandido);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  function totalDivida(clienteId: number): { total: number; pago: number } {
    if (expandido !== clienteId)
      return { total: 0, pago: 0 };
    return dividas.reduce(
      (acc, d) => ({
        total: acc.total + d.valor_total,
        pago: acc.pago + d.valor_pago,
      }),
      { total: 0, pago: 0 }
    );
  }

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Fiado</h2>
        <Button onClick={abrirNovoCliente} size="lg" className="gap-2">
          <Plus className="h-5 w-5" />
          Novo Cliente
        </Button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-10 h-12 text-base"
        />
      </div>

      {/* Lista de clientes */}
      <div className="space-y-2">
        {clientes.length === 0 ? (
          <p className="text-center p-8 text-muted-foreground">
            Nenhum cliente encontrado
          </p>
        ) : (
          clientes.map((c) => (
            <div key={c.id} className="border rounded-lg overflow-hidden">
              {/* Header do cliente */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                onClick={() => toggleExpandir(c.id)}
              >
                <div className="flex items-center gap-3">
                  {expandido === c.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{c.nome}</p>
                    {c.telefone && (
                      <p className="text-sm text-muted-foreground">
                        {c.telefone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirEditarCliente(c);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteCliente(c.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Dívidas expandidas */}
              {expandido === c.id && (
                <div className="border-t bg-muted/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Total: R$ {totalDivida(c.id).total.toFixed(2)} | Pago: R${" "}
                      {totalDivida(c.id).pago.toFixed(2)} |{" "}
                      <span className="font-bold text-foreground">
                        Restante: R${" "}
                        {(
                          totalDivida(c.id).total - totalDivida(c.id).pago
                        ).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {totalDivida(c.id).total - totalDivida(c.id).pago > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={abrirPagamentoCliente}
                        >
                          <Wallet className="h-4 w-4" />
                          Pagar
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => abrirNovaDivida(c.id)}
                      >
                        <Plus className="h-4 w-4" />
                        Nova Dívida
                      </Button>
                    </div>
                  </div>

                  {dividas.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Nenhuma dívida registrada
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {dividas.map((d) => (
                        <div key={d.id} className="bg-background rounded border">
                          <div className="flex items-center justify-between p-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{d.descricao}</p>
                                {d.quitada ? (
                                  <Badge className="gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                                    <Check className="h-3 w-3" />
                                    Quitada
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive" className="gap-1">
                                    Pendente
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(d.created_at).toLocaleDateString("pt-BR")}
                                {" | "}Total: {fmt(d.valor_total)} | Pago: {fmt(d.valor_pago)} |
                                Restante: {fmt(d.valor_total - d.valor_pago)}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              {!d.quitada && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => abrirPagamento(d)}
                                >
                                  <CircleDollarSign className="h-4 w-4" />
                                  Pagar
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                title="Ver pagamentos"
                                onClick={() => togglePagamentos(d.id)}
                              >
                                <Receipt className="h-4 w-4" />
                                {pagamentosDe === d.id ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Editar dívida"
                                onClick={() => abrirEditarDivida(d)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => setConfirmDeleteDivida(d.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {pagamentosDe === d.id && (
                            <div className="border-t bg-muted/20 px-3 py-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Pagamentos
                              </p>
                              {pagamentos.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-1">
                                  Nenhum pagamento registrado
                                </p>
                              ) : (
                                <div className="space-y-1">
                                  {pagamentos.map((p) => (
                                    <div
                                      key={p.id}
                                      className="flex items-center justify-between text-sm py-1"
                                    >
                                      <span className="text-muted-foreground">
                                        {new Date(p.created_at).toLocaleString("pt-BR", {
                                          dateStyle: "short",
                                          timeStyle: "short",
                                        })}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono font-medium mr-2">
                                          {fmt(p.valor)}
                                        </span>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7"
                                          title="Editar pagamento"
                                          onClick={() => abrirEditarPagamento(p)}
                                        >
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 text-destructive"
                                          title="Excluir pagamento"
                                          onClick={() => setConfirmDeletePagamento(p.id)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dialog cliente */}
      <Dialog open={clienteDialogOpen} onOpenChange={setClienteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingClienteId ? "Editar Cliente" : "Novo Cliente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nome</Label>
              <Input
                value={clienteForm.nome}
                onChange={(e) =>
                  setClienteForm({ ...clienteForm, nome: e.target.value })
                }
                placeholder="Nome do cliente"
                className="h-11"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={clienteForm.telefone}
                onChange={(e) =>
                  setClienteForm({ ...clienteForm, telefone: e.target.value })
                }
                placeholder="(11) 99999-9999"
                className="h-11"
              />
            </div>
            <Button onClick={salvarCliente} size="lg" className="w-full">
              {editingClienteId ? "Salvar Alterações" : "Cadastrar Cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog dívida */}
      <Dialog open={dividaDialogOpen} onOpenChange={setDividaDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Dívida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={usarEstoque}
                onChange={(e) => {
                  setUsarEstoque(e.target.checked);
                  if (!e.target.checked) {
                    setDividaForm({ ...dividaForm, produto_id: null });
                  }
                }}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm font-medium">Item do estoque?</span>
            </label>

            {usarEstoque && (
              <div className="space-y-4 rounded-lg border bg-muted/20 p-3">
                <div>
                  <Label>Produto</Label>
                  <ProductPicker
                    produtos={produtos}
                    value={dividaForm.produto_id}
                    onChange={selecionarProduto}
                  />
                </div>
                {dividaForm.produto_id && (
                  <div>
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      max={
                        produtos.find((p) => p.id === dividaForm.produto_id)
                          ?.quantidade ?? 999
                      }
                      value={dividaForm.quantidade}
                      onChange={(e) =>
                        atualizarQuantidade(parseInt(e.target.value) || 1)
                      }
                      className="h-11"
                    />
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={dividaForm.descricao}
                onChange={(e) =>
                  setDividaForm({ ...dividaForm, descricao: e.target.value })
                }
                placeholder="Descreva a compra..."
                rows={2}
              />
            </div>
            <div>
              <Label>Valor Total (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={dividaForm.valor_total}
                onChange={(e) =>
                  setDividaForm({
                    ...dividaForm,
                    valor_total: parseFloat(e.target.value) || 0,
                  })
                }
                className="h-11"
              />
            </div>
            <Button onClick={salvarDivida} size="lg" className="w-full">
              Registrar Dívida
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pagamento */}
      <Dialog
        open={pagamentoDialogOpen}
        onOpenChange={setPagamentoDialogOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Valor restante: R$ {selectedDividaRestante.toFixed(2)}
            </p>
            <div>
              <Label>Valor do Pagamento (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={pagamentoValor}
                onChange={(e) =>
                  setPagamentoValor(parseFloat(e.target.value) || 0)
                }
                className="h-11"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => registrarPagamento(selectedDividaRestante)}
              >
                Quitar Total
              </Button>
              <Button
                onClick={() => registrarPagamento()}
                size="lg"
                className="flex-1"
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog editar dívida */}
      <Dialog open={editDividaOpen} onOpenChange={setEditDividaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Dívida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={editDividaForm.descricao}
                onChange={(e) =>
                  setEditDividaForm({ ...editDividaForm, descricao: e.target.value })
                }
                rows={2}
              />
            </div>
            <div>
              <Label>Valor Total (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editDividaForm.valor_total}
                onChange={(e) =>
                  setEditDividaForm({
                    ...editDividaForm,
                    valor_total: parseFloat(e.target.value) || 0,
                  })
                }
                className="h-11"
              />
              {editDivida && editDivida.valor_pago > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Já pago: {fmt(editDivida.valor_pago)}. O total não pode ficar abaixo disso.
                </p>
              )}
            </div>
            <Button onClick={salvarEdicaoDivida} size="lg" className="w-full">
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog editar pagamento */}
      <Dialog
        open={editPagamento !== null}
        onOpenChange={(open) => !open && setEditPagamento(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {editPagamento && (
              <p className="text-sm text-muted-foreground">
                Registrado em{" "}
                {new Date(editPagamento.created_at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editPagamentoValor}
                onChange={(e) => setEditPagamentoValor(parseFloat(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <Button onClick={salvarEdicaoPagamento} size="lg" className="w-full">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pagamento do cliente (várias dívidas) */}
      <Dialog open={pagClienteOpen} onOpenChange={setPagClienteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagamento do Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {expandido && (
              <p className="text-sm text-muted-foreground">
                Total em aberto:{" "}
                <span className="font-bold text-foreground">
                  {fmt(totalDivida(expandido).total - totalDivida(expandido).pago)}
                </span>
                <br />
                O valor é abatido das dívidas mais antigas primeiro.
              </p>
            )}
            <div>
              <Label>Valor do Pagamento (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={pagClienteValor}
                onChange={(e) => setPagClienteValor(parseFloat(e.target.value) || 0)}
                className="h-11"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() =>
                  expandido &&
                  pagarCliente(totalDivida(expandido).total - totalDivida(expandido).pago)
                }
              >
                Quitar Tudo
              </Button>
              <Button onClick={() => pagarCliente()} size="lg" className="flex-1">
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeletePagamento !== null}
        onOpenChange={(open) => !open && setConfirmDeletePagamento(null)}
        title="Excluir pagamento"
        description="O valor volta a ficar pendente na dívida e o lançamento sai do caixa. Continuar?"
        confirmLabel="Excluir"
        onConfirm={() => {
          if (confirmDeletePagamento) deletarPagamento(confirmDeletePagamento);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteCliente !== null}
        onOpenChange={(open) => !open && setConfirmDeleteCliente(null)}
        title="Excluir cliente"
        description="Excluir este cliente e todas as suas dívidas?"
        confirmLabel="Excluir"
        onConfirm={() => {
          if (confirmDeleteCliente) deletarCliente(confirmDeleteCliente);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteDivida !== null}
        onOpenChange={(open) => !open && setConfirmDeleteDivida(null)}
        title="Excluir dívida"
        description="Tem certeza que deseja excluir esta dívida?"
        confirmLabel="Excluir"
        onConfirm={() => {
          if (confirmDeleteDivida) deletarDivida(confirmDeleteDivida);
        }}
      />
    </div>
  );
}
