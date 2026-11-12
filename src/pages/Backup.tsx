import { useEffect, useState } from "react";
import {
  HardDrive,
  FolderOpen,
  Download,
  RefreshCw,
  Check,
  ArrowUpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { api } from "@/lib/api";
import { checkForUpdates } from "@/lib/updater";

interface BackupInfo {
  arquivo: string;
  caminho: string;
  tamanho_bytes: number;
  data_modificacao: string;
}

export default function BackupPage() {
  const [pastaDestino, setPastaDestino] = useState("");
  const [pastaSalva, setPastaSalva] = useState("");
  const [historico, setHistorico] = useState<BackupInfo[]>([]);
  const [executando, setExecutando] = useState(false);
  const [versao, setVersao] = useState("");
  const [verificandoUpdate, setVerificandoUpdate] = useState(false);

  useEffect(() => {
    carregarConfig();
    carregarHistorico();
    getVersion().then(setVersao).catch(() => {});
  }, []);

  async function verificarAtualizacoes() {
    setVerificandoUpdate(true);
    try {
      await checkForUpdates({ silent: false });
    } finally {
      setVerificandoUpdate(false);
    }
  }

  async function carregarConfig() {
    try {
      const config = await api.get<{ pasta_destino: string }>(
        "/backup/config"
      );
      setPastaDestino(config.pasta_destino);
      setPastaSalva(config.pasta_destino);
    } catch {
      // config não existe ainda
    }
  }

  async function carregarHistorico() {
    try {
      const data = await api.get<BackupInfo[]>("/backup/historico");
      setHistorico(data);
    } catch {
      // sem histórico
    }
  }

  // Salva a pasta assim que ela é escolhida: antes dependia de um clique em
  // "Salvar" separado e, se esquecido, o backup rodava na pasta antiga
  // (que podia nem existir mais) e falhava com "pasta não encontrada".
  async function selecionarPasta() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Selecionar pasta de backup",
    });
    if (!selected) return;
    setPastaDestino(selected);
    await salvarConfig(selected);
  }

  async function salvarConfig(pasta: string = pastaDestino) {
    if (!pasta) {
      toast.error("Informe a pasta de destino");
      return;
    }
    try {
      const r = await api.post<{ ok: boolean; pasta_destino: string }>(
        "/backup/config",
        { pasta_destino: pasta }
      );
      setPastaDestino(r.pasta_destino);
      setPastaSalva(r.pasta_destino);
      toast.success("Pasta de backup configurada");
      carregarHistorico();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  async function executarBackup() {
    if (!pastaDestino) {
      toast.error("Selecione a pasta de destino primeiro");
      return;
    }
    setExecutando(true);
    try {
      // Manda a pasta atual da tela: o backend usa (e grava) exatamente ela.
      const result = await api.post<{
        ok: boolean;
        arquivo: string;
        tamanho_bytes: number;
      }>("/backup/executar", { pasta_destino: pastaDestino });
      setPastaSalva(pastaDestino);
      toast.success(`Backup criado: ${result.arquivo}`);
      carregarHistorico();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao executar backup");
    } finally {
      setExecutando(false);
    }
  }

  function formatarTamanho(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Backup</h2>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderOpen className="h-5 w-5" />
            Pasta de Destino
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure a pasta onde os backups serão salvos (ex: pasta do Google
            Drive ou OneDrive).
          </p>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Caminho da Pasta</Label>
              <div
                className="flex items-center h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={selecionarPasta}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
                <span className={pastaDestino ? "text-foreground" : "text-muted-foreground"}>
                  {pastaDestino || "Clique para selecionar a pasta..."}
                </span>
              </div>
            </div>
            <div className="flex items-end">
              <Button onClick={selecionarPasta} size="lg" variant="outline" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Escolher pasta
              </Button>
            </div>
          </div>
          {pastaSalva && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <Check className="h-4 w-4" />
              Configurado: {pastaSalva}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Executar backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5" />
            Backup Manual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            onClick={executarBackup}
            size="lg"
            className="gap-2"
            disabled={!pastaDestino || executando}
          >
            {executando ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            {executando ? "Executando..." : "Fazer Backup Agora"}
          </Button>
          {!pastaDestino && (
            <p className="text-sm text-muted-foreground mt-2">
              Escolha a pasta de destino primeiro.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Atualizações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ArrowUpCircle className="h-5 w-5" />
            Atualizações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Versão instalada: <span className="font-medium text-foreground">{versao || "—"}</span>
          </p>
          <Button
            onClick={verificarAtualizacoes}
            size="lg"
            variant="outline"
            className="gap-2"
            disabled={verificandoUpdate}
          >
            <RefreshCw className={`h-5 w-5 ${verificandoUpdate ? "animate-spin" : ""}`} />
            {verificandoUpdate ? "Verificando..." : "Verificar atualizações"}
          </Button>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Histórico de Backups</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={carregarHistorico}
            className="gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {historico.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Nenhum backup encontrado
            </p>
          ) : (
            <div className="space-y-2">
              {historico.map((b, i) => (
                <div
                  key={b.arquivo}
                  className="flex items-center justify-between p-3 border rounded"
                >
                  <div>
                    <p className="font-medium text-sm">{b.arquivo}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(b.data_modificacao).toLocaleString("pt-BR")} —{" "}
                      {formatarTamanho(b.tamanho_bytes)}
                    </p>
                  </div>
                  {i === 0 && (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                      Mais recente
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
