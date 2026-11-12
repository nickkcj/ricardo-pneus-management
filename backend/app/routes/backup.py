import json
import sqlite3
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import DB_PATH

router = APIRouter(prefix="/api/backup", tags=["backup"])

CONFIG_PATH = DB_PATH.parent / "backup_config.json"


class BackupConfig(BaseModel):
    pasta_destino: str


class BackupExecutar(BaseModel):
    # Opcional: a pasta escolhida na tela. Se vier, vira a configuração
    # corrente, pra não depender de um "Salvar" separado.
    pasta_destino: str | None = None


def _load_config() -> dict | None:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
    return None


def _save_config(config: dict):
    CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")


def _normalizar_pasta(valor: str) -> Path:
    """Limpa o caminho vindo da UI (aspas, espaços, ~) e resolve."""
    limpo = valor.strip().strip('"').strip("'")
    if not limpo:
        raise HTTPException(status_code=400, detail="Informe a pasta de destino")
    return Path(limpo).expanduser()


def _garantir_pasta(pasta: Path) -> Path:
    """Garante que a pasta existe e é gravável; tenta criar se não existir.

    Cobre o caso comum de a pasta ter sido apagada/renomeada (ou estar num
    drive que ainda não montou) depois de configurada.
    """
    if pasta.exists() and not pasta.is_dir():
        raise HTTPException(
            status_code=400,
            detail=f"O caminho não é uma pasta: {pasta}",
        )
    if not pasta.exists():
        try:
            pasta.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Pasta não encontrada e não foi possível criá-la: {pasta} "
                    f"({e.strerror or e}). Verifique se o drive está conectado."
                ),
            )
    return pasta


@router.get("/config")
def obter_config():
    config = _load_config()
    return config or {"pasta_destino": ""}


@router.post("/config")
def salvar_config(data: BackupConfig):
    pasta = _garantir_pasta(_normalizar_pasta(data.pasta_destino))
    _save_config({"pasta_destino": str(pasta)})
    return {"ok": True, "pasta_destino": str(pasta)}


@router.post("/executar")
def executar_backup(data: BackupExecutar | None = None):
    pasta_str = (data.pasta_destino if data else None) or ""
    if not pasta_str.strip():
        config = _load_config()
        pasta_str = (config or {}).get("pasta_destino", "")
    if not pasta_str.strip():
        raise HTTPException(status_code=400, detail="Pasta de backup não configurada")

    destino = _garantir_pasta(_normalizar_pasta(pasta_str))

    # Mantém a configuração sincronizada com a pasta efetivamente usada
    config = _load_config() or {}
    if config.get("pasta_destino") != str(destino):
        _save_config({"pasta_destino": str(destino)})

    if not DB_PATH.exists():
        raise HTTPException(status_code=500, detail=f"Banco não encontrado: {DB_PATH}")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    destino_arquivo = destino / f"ricardo_pneus_backup_{timestamp}.db"
    n = 2
    while destino_arquivo.exists():  # dois backups no mesmo segundo
        destino_arquivo = destino / f"ricardo_pneus_backup_{timestamp}_{n}.db"
        n += 1

    # Usa a API de backup do SQLite: gera uma cópia consistente mesmo com o
    # banco aberto pelo app (copiar o arquivo direto pode sair corrompido).
    try:
        origem = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        try:
            copia = sqlite3.connect(destino_arquivo)
            try:
                origem.backup(copia)
            finally:
                copia.close()
        finally:
            origem.close()
    except Exception as e:
        try:
            destino_arquivo.unlink(missing_ok=True)
        except OSError:
            pass
        raise HTTPException(status_code=500, detail=f"Erro ao gravar o backup em {destino}: {e}")

    return {
        "ok": True,
        "arquivo": str(destino_arquivo),
        "tamanho_bytes": destino_arquivo.stat().st_size,
    }


@router.get("/historico")
def historico_backups():
    config = _load_config()
    if not config or not config.get("pasta_destino"):
        return []

    pasta = Path(config["pasta_destino"])
    if not pasta.is_dir():
        return []

    backups = []
    for f in sorted(pasta.glob("ricardo_pneus_backup_*.db"), reverse=True):
        try:
            st = f.stat()
        except OSError:
            continue
        backups.append({
            "arquivo": f.name,
            "caminho": str(f),
            "tamanho_bytes": st.st_size,
            "data_modificacao": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    return backups
