"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Settings, RotateCcw, BarChart3, Sun, Moon, Laptop, Sparkles, RefreshCcw, Clock3, Volume2, BookOpen, GraduationCap, FileText, Library, MousePointer2, Database, BrainCircuit, Cloud, WifiOff, CheckCircle2, LockKeyhole, UnlockKeyhole, Loader2, Link2 } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { AiStatusPanel } from "@/components/ai-status-panel"
import { useGrammarProgress } from "@/hooks/use-grammar-progress"
import { useGptModel, AVAILABLE_MODELS } from "@/hooks/use-gpt-model"
import { useAnimations } from "@/hooks/use-animations"
import { useStudyTimer } from "@/hooks/use-study-timer"
import { useStudyShortcutCoach } from "@/hooks/use-study-shortcut-coach"
import { useStudyHeaderPreference } from "@/hooks/use-study-header-preference"
import { useReviewMistakeThreshold } from "@/hooks/use-review-mistake-threshold"
import { useAiPreferences, PRONUNCIATION_VOICES } from "@/hooks/use-ai-preferences"
import { useSyncCode } from "@/hooks/use-sync-code"
import { useRegencyPreferences } from "@/hooks/use-regency-preferences"
import { useCardShape } from "@/hooks/use-card-shape"
import { useReadLabPreferences } from "@/hooks/use-readlab-preferences"
import {
  AUTO_SYNC_STATUS_EVENT,
  publishAutoSyncState,
  type AutoSyncState,
} from "@/lib/auto-sync-client"
import {
  claimSyncIdentity,
  completeSyncPairing,
  startSyncPairing,
} from "@/lib/sync-identity-client"
import { cn } from "@/lib/utils"

type ColorPalette = "blue" | "sage" | "terracotta" | "ocean"

const COLOR_PALETTE_KEY = "vocablab_color_palette"

export function SettingsDialog() {
  const { resetStats } = useGrammarProgress()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const { enabled: animationsEnabled, setEnabled: setAnimationsEnabled } = useAnimations()
  const { enabled: studyTimerEnabled, setEnabled: setStudyTimerEnabled } = useStudyTimer()
  const { enabled: shortcutCoachEnabled, setEnabled: setShortcutCoachEnabled } = useStudyShortcutCoach()
  const { startCollapsed: studyHeaderCollapsed, setStartCollapsed: setStudyHeaderCollapsed } = useStudyHeaderPreference()
  const { threshold: reviewMistakeThreshold, setThreshold: setReviewMistakeThreshold } = useReviewMistakeThreshold()
  const { squareCards, setSquareCards } = useCardShape()
  const {
    synonymsDisplayCount,
    setSynonymsDisplayCount,
    includeConjugations,
    setIncludeConjugations,
    includeAlternativeForms,
    setIncludeAlternativeForms,
    efommMode,
    setEfommMode,
    includeMultipleTranslations,
    setIncludeMultipleTranslations,
    showManualOptionalFields,
    setShowManualOptionalFields,
    showRegenerateAudioButton,
    setShowRegenerateAudioButton,
    useAiPredictions,
    setUseAiPredictions,
    pronunciationVoice,

    setPronunciationVoice,
    showContext,
    setShowContext,
    contextInPortuguese,
    setContextInPortuguese,
    showIPA,
    setShowIPA,
    showGrammaticalForm,
    setShowGrammaticalForm,
  } = useAiPreferences()
  const {
    syncWord,
    syncPin,
    syncCode,
    setSyncWord,
    setSyncPin,
    isValid: isSyncCodeValid,
    isIdentityLocked,
    setIdentityLocked,
  } = useSyncCode()
  const { model, setModel } = useGptModel()
  const {
    showCategory,
    setShowCategory,
    showGrammaticalForm: showRegencyGrammaticalForm,
    setShowGrammaticalForm: setShowRegencyGrammaticalForm,
    showMeaning,
    setShowMeaning,
    showContrast,
    setShowContrast,
    showExample,
    setShowExample,
    showTranslation,
    setShowTranslation,
  } = useRegencyPreferences()
  const {
    audioVoice: readLabAudioVoice,
    setAudioVoice: setReadLabAudioVoice,
    showRegenerateAudioButton: readLabShowRegenerate,
    setShowRegenerateAudioButton: setReadLabShowRegenerate,
  } = useReadLabPreferences()
  const [palette, setPalette] = useState<ColorPalette>("blue")
  const [syncState, setSyncState] = useState<AutoSyncState>({
    state: "idle",
    message: "Escolha uma palavra para ativar a sincronização automática.",
  })
  const [identityBusy, setIdentityBusy] = useState<"claim" | "pair-start" | "pair-complete" | null>(null)
  const [identityError, setIdentityError] = useState("")
  const [syncSetupMode, setSyncSetupMode] = useState<"create" | "pair">("create")
  const [pairingCode, setPairingCode] = useState("")
  const [pairingExpiresAt, setPairingExpiresAt] = useState("")
  const [pairingInput, setPairingInput] = useState("")
  const [activeTab, setActiveTab] = useState<"general" | "sync" | "vocab" | "regency" | "read" | "rule" | "wiki">("general")
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0 }, [activeTab])

  useEffect(() => {
    const savedPalette = localStorage.getItem(COLOR_PALETTE_KEY) as ColorPalette | null
    const initial = savedPalette === "sage" || savedPalette === "terracotta" || savedPalette === "ocean" || savedPalette === "blue" ? savedPalette : "blue"
    setPalette(initial)
  }, [])

  useEffect(() => {
    if (isIdentityLocked) return
    setIdentityError("")
    setPairingInput("")
  }, [isIdentityLocked, syncPin, syncWord])

  const handleIdentityButton = async () => {
    if (isIdentityLocked) {
      setIdentityLocked(false)
      setPairingCode("")
      setPairingExpiresAt("")
      publishAutoSyncState({
        state: "idle",
        message: "Sincronização pausada enquanto a identificação está desbloqueada.",
      })
      return
    }
    if (!isSyncCodeValid || identityBusy) return
    setIdentityBusy("claim")
    setIdentityError("")
    try {
      const result = await claimSyncIdentity(syncCode)
      if (!result.ok) {
        if (result.taken) setSyncSetupMode("pair")
        setIdentityError(result.error)
        return
      }
      setIdentityLocked(true)
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : "Não foi possível confirmar.")
    } finally {
      setIdentityBusy(null)
    }
  }

  const handleStartPairing = async () => {
    if (!syncCode || identityBusy) return
    setIdentityBusy("pair-start")
    setIdentityError("")
    try {
      const result = await startSyncPairing(syncCode)
      setPairingCode(result.pairingCode)
      setPairingExpiresAt(result.expiresAt)
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : "Não foi possível gerar o código.")
    } finally {
      setIdentityBusy(null)
    }
  }

  const handleCompletePairing = async () => {
    if (!syncCode || !/^\d{6}$/.test(pairingInput) || identityBusy) return
    setIdentityBusy("pair-complete")
    setIdentityError("")
    try {
      await completeSyncPairing(syncCode, pairingInput)
      setPairingInput("")
      setIdentityLocked(true)
      setSyncSetupMode("create")
      publishAutoSyncState({
        state: "connecting",
        message: "Dispositivo autorizado. Recebendo os dados sincronizados…",
      })
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : "Não foi possível concluir o pareamento.")
    } finally {
      setIdentityBusy(null)
    }
  }

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("palette-blue", "palette-beige", "palette-violet", "palette-gray", "palette-sage", "palette-terracotta", "palette-ocean")
    if (resolvedTheme !== "dark") root.classList.add(`palette-${palette}`)
    localStorage.setItem(COLOR_PALETTE_KEY, palette)
  }, [palette, resolvedTheme])

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vocablab_sync_status")
      if (saved) setSyncState(JSON.parse(saved) as AutoSyncState)
    } catch {
      // A status entry is disposable; synchronization data lives in IndexedDB.
    }
    const update = (event: Event) => {
      setSyncState((event as CustomEvent<AutoSyncState>).detail)
    }
    window.addEventListener(AUTO_SYNC_STATUS_EVENT, update)
    return () => window.removeEventListener(AUTO_SYNC_STATUS_EVENT, update)
  }, [])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full text-muted-foreground/50 hover:bg-background/70 hover:text-muted-foreground/70 hover:shadow-sm">
          <Settings className="size-5" />
          <span className="sr-only">Configurações</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(760px,92vh)] max-w-[94vw] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 p-5">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="size-5 text-primary" />
            Configurações
          </DialogTitle>
          <DialogDescription>
            Preferências do app. A chave de API é configurada via .env.local no servidor.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col border-t sm:flex-row">
          <div className="grid shrink-0 grid-cols-2 gap-1 border-b bg-muted/30 p-2 sm:block sm:w-44 sm:border-b-0 sm:border-r">
            <Button
              variant="ghost"
              className={cn(
                "mb-1 w-full justify-start gap-2",
                activeTab === "general" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("general")}
            >
              <RefreshCcw className="size-4 text-primary" />
              Geral
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "mb-1 w-full justify-start gap-2",
                activeTab === "sync" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("sync")}
            >
              <Cloud className="size-4 text-primary" />
              Sincronização
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "mb-1 w-full justify-start gap-2",
                activeTab === "vocab" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("vocab")}
            >
              <BookOpen className="size-4 text-primary" />
              VocabLab
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "mb-1 w-full justify-start gap-2",
                activeTab === "regency" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("regency")}
            >
              <GraduationCap className="size-4 text-primary" />
              RegencyLab
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "mb-1 w-full justify-start gap-2",
                activeTab === "read" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("read")}
            >
              <FileText className="size-4 text-primary" />
              ReadLab
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "mb-1 w-full justify-start gap-2",
                activeTab === "rule" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("rule")}
            >
              <BookOpen className="size-4 text-primary" />
              RuleLab
            </Button>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2",
                activeTab === "wiki" && "bg-background shadow-sm"
              )}
              onClick={() => setActiveTab("wiki")}
            >
              <Library className="size-4 text-primary" />
              Wiki
            </Button>
          </div>

          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="space-y-6">
              <div className="space-y-6">
                <div className={cn("space-y-5", activeTab !== "general" && "hidden")}>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold"><Settings className="size-4 text-primary" />Configurações gerais</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Aparência, comportamento de estudo, diagnóstico e segurança dos dados.</p>
                  </div>

                  <section className="space-y-4 rounded-xl border border-border/50 bg-background/55 p-4">
                    <div><h4 className="flex items-center gap-2 text-sm font-medium"><Sun className="size-4 text-primary" />Aparência</h4><p className="mt-0.5 text-[10px] text-muted-foreground">Tema, identidade de cores e formato compartilhado dos cards.</p></div>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                      <Button variant={theme === "light" ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setTheme("light")}><Sun className="size-3.5" />Claro</Button>
                      <Button variant={theme === "dark" ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setTheme("dark")}><Moon className="size-3.5" />Escuro</Button>
                      <Button variant={theme === "system" ? "secondary" : "ghost"} size="sm" className="h-8 gap-1.5" onClick={() => setTheme("system")}><Laptop className="size-3.5" />Sistema</Button>
                    </div>
                    {resolvedTheme !== "dark" && <div className="border-t border-border/40 pt-4">
                      <Label className="text-xs">Paleta do modo claro</Label>
                      <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:grid-cols-4">
                        {([ ["blue", "Azul"], ["sage", "Sálvia"], ["terracotta", "Terracota"], ["ocean", "Oceano"] ] as const).map(([value, label]) => <Button key={value} variant={palette === value ? "secondary" : "ghost"} size="sm" className="h-8 px-1 text-[11px]" onClick={() => setPalette(value)}>{label}</Button>)}
                      </div>
                    </div>}
                    <SettingRow label="Cards quadrados" description="Aplica o formato quadrado às grades do VocabLab, RegencyLab e RuleLab."><Switch checked={squareCards} onCheckedChange={setSquareCards} /></SettingRow>
                  </section>

                  <section className="space-y-1 rounded-xl border border-border/50 bg-background/55 p-4">
                    <div className="pb-3"><h4 className="flex items-center gap-2 text-sm font-medium"><BrainCircuit className="size-4 text-primary" />Experiência de estudo</h4><p className="mt-0.5 text-[10px] text-muted-foreground">Preferências compartilhadas por todos os modos Study.</p></div>
                    <SettingRow label="Efeitos e animações" description="Ativa transições, viradas e saídas direcionais dos cards."><Switch checked={animationsEnabled} onCheckedChange={setAnimationsEnabled} /></SettingRow>
                    <SettingRow label="Cronômetro" description="Mostra o tempo decorrido durante cada sessão."><Switch checked={studyTimerEnabled} onCheckedChange={setStudyTimerEnabled} /></SettingRow>
                    <SettingRow label="Dicas de atalhos" description="Mostra as setas de ajuda ao lado do primeiro card de cada sessão."><Switch checked={shortcutCoachEnabled} onCheckedChange={setShortcutCoachEnabled} /></SettingRow>
                    <SettingRow label="Cabeçalho recolhido" description="Inicia todas as novas sessões Study com o painel de progresso oculto."><Switch checked={studyHeaderCollapsed} onCheckedChange={setStudyHeaderCollapsed} /></SettingRow>
                    <SettingRow
                      label="Erros para enviar ao Review"
                      description="Quantidade de Again no mesmo card antes de adicioná-lo ao Review da pasta de origem."
                    >
                      <Select
                        value={String(reviewMistakeThreshold)}
                        onValueChange={(value) => setReviewMistakeThreshold(Number(value))}
                      >
                        <SelectTrigger className="h-9 w-[88px]" aria-label="Erros necessários para enviar ao Review">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                            <SelectItem key={value} value={String(value)}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingRow>
                  </section>

                  <AiStatusPanel />

                  <section className="rounded-xl border border-border/50 bg-background/55 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-medium"><BarChart3 className="size-4 text-primary" />Histórico de estudo</h4>
                    <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"><RotateCcw className="mr-2 size-4" />Resetar estatísticas</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Resetar estatísticas?</AlertDialogTitle><AlertDialogDescription>Isso apagará permanentemente seu histórico e progresso. Cards e pastas não serão afetados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={resetStats}>Resetar agora</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                  </section>
                </div>

                <div className={cn("space-y-5", activeTab !== "sync" && "hidden")}>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold"><Cloud className="size-4 text-primary" />Sincronização</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Envio e recebimento automáticos, separados por Lab e protegidos contra sobrescritas concorrentes.</p>
                  </div>
                  <section className="space-y-4 rounded-xl border border-border/50 bg-background/55 p-4">
                    {!isIdentityLocked && (
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                        <Button
                          type="button"
                          variant={syncSetupMode === "create" ? "secondary" : "ghost"}
                          size="sm"
                          className="h-9"
                          onClick={() => {
                            setSyncSetupMode("create")
                            setIdentityError("")
                          }}
                        >
                          Criar sincronização
                        </Button>
                        <Button
                          type="button"
                          variant={syncSetupMode === "pair" ? "secondary" : "ghost"}
                          size="sm"
                          className="h-9"
                          onClick={() => {
                            setSyncSetupMode("pair")
                            setIdentityError("")
                          }}
                        >
                          Conectar dispositivo
                        </Button>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_104px]">
                      <div>
                        <Label htmlFor="sync-word" className="mb-1.5 block text-xs">
                          {syncSetupMode === "pair" && !isIdentityLocked ? "Palavra existente" : "Sua palavra"}
                        </Label>
                        <Input id="sync-word" value={syncWord} onChange={(event) => setSyncWord(event.target.value)} placeholder="Ex.: gustavo" autoComplete="off" disabled={isIdentityLocked} />
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {syncSetupMode === "pair" && !isIdentityLocked
                            ? "Digite a mesma palavra usada no dispositivo principal."
                            : "Use de 2 a 24 letras ou números e confirme para conectar."}
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="sync-pin" className="mb-1.5 block text-xs">
                          {syncSetupMode === "pair" && !isIdentityLocked ? "PIN existente" : "PIN do navegador"}
                        </Label>
                        <Input
                          id="sync-pin"
                          value={syncPin}
                          onChange={(event) => setSyncPin(event.target.value)}
                          inputMode="numeric"
                          pattern="[0-9]{4}"
                          maxLength={4}
                          className="font-mono text-center tracking-[0.18em]"
                          aria-label="PIN de sincronização"
                          disabled={isIdentityLocked}
                        />
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {syncSetupMode === "pair" && !isIdentityLocked
                            ? "Digite o mesmo PIN de quatro dígitos."
                            : "Gerado uma vez e usado junto com sua palavra."}
                        </p>
                      </div>
                    </div>
                    {!isIdentityLocked && syncSetupMode === "pair" ? (
                      <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/[0.05] p-3">
                        <div>
                          <Label htmlFor="sync-pairing-code" className="text-xs">Código temporário de pareamento</Label>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                            No dispositivo já conectado, escolha “Gerar código”. Digite aqui os seis dígitos exibidos.
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            id="sync-pairing-code"
                            value={pairingInput}
                            onChange={(event) => setPairingInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            inputMode="numeric"
                            maxLength={6}
                            placeholder="000000"
                            className="font-mono text-center tracking-[0.2em]"
                            aria-label="Código temporário de pareamento"
                          />
                          <Button
                            type="button"
                            className="sm:min-w-32"
                            disabled={!isSyncCodeValid || !/^\d{6}$/.test(pairingInput) || identityBusy !== null}
                            onClick={() => void handleCompletePairing()}
                          >
                            {identityBusy === "pair-complete" && <Loader2 className="mr-2 size-4 animate-spin" />}
                            Conectar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant={isIdentityLocked ? "outline" : "default"}
                        className="w-full"
                        disabled={identityBusy !== null || (!isIdentityLocked && !isSyncCodeValid)}
                        onClick={() => void handleIdentityButton()}
                      >
                        {identityBusy === "claim"
                          ? <><Loader2 className="mr-2 size-4 animate-spin" />Verificando disponibilidade…</>
                          : isIdentityLocked
                          ? <><UnlockKeyhole className="mr-2 size-4" />Desbloquear e trocar dados</>
                          : <><LockKeyhole className="mr-2 size-4" />Criar e conectar</>}
                      </Button>
                    )}
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {isIdentityLocked
                        ? "Os campos estão protegidos. Desbloqueie somente para conectar outro conjunto de dados; a sincronização será pausada enquanto você edita."
                        : syncSetupMode === "pair"
                          ? "O código temporário autoriza este navegador sem compartilhar a chave privada do primeiro dispositivo."
                          : "Use esta opção somente para uma identificação nova. Para abrir dados existentes, escolha “Conectar dispositivo”."}
                    </p>
                    {identityError && (
                      <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-3 py-3">
                        <p className="text-xs font-medium text-destructive">{identityError}</p>
                      </div>
                    )}
                    {isIdentityLocked && (
                      <div className="rounded-xl border border-border/45 bg-muted/20 px-3 py-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="flex items-center gap-2 text-xs font-medium"><Link2 className="size-3.5 text-primary" />Conectar outro dispositivo</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">Gere um código descartável, válido por cinco minutos.</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={identityBusy !== null}
                            onClick={() => void handleStartPairing()}
                          >
                            {identityBusy === "pair-start" && <Loader2 className="mr-2 size-4 animate-spin" />}
                            Gerar código
                          </Button>
                        </div>
                        {pairingCode && (
                          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 text-center">
                            <p className="font-mono text-xl font-semibold tracking-[0.28em] text-primary">{pairingCode}</p>
                            <p className="mt-1 text-[9px] text-muted-foreground">Expira às {new Date(pairingExpiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} e funciona apenas uma vez.</p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className={cn(
                      "flex items-start gap-3 rounded-xl border px-3 py-3",
                      syncState.state === "error" || syncState.state === "conflict"
                        ? "border-destructive/25 bg-destructive/[0.06]"
                        : "border-primary/20 bg-primary/[0.05]",
                    )}>
                      {syncState.state === "offline"
                        ? <WifiOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        : syncState.state === "synced"
                          ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                          : <RefreshCcw className={cn("mt-0.5 size-4 shrink-0 text-primary", syncState.state === "connecting" && "animate-spin")} />}
                      <div className="min-w-0">
                        <p className="text-xs font-medium">{isSyncCodeValid && isIdentityLocked ? "Sincronização automática" : "Aguardando confirmação"}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{syncState.message}</p>
                        {syncState.updatedAt && <p className="mt-1 text-[9px] text-muted-foreground/75">Última atividade: {new Date(syncState.updatedAt).toLocaleString("pt-BR")}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(["general", "vocab", "regency", "rule", "read", "question"] as const).map((lab) => (
                        <div key={lab} className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                          <p className="text-[10px] font-medium capitalize">{lab === "general" ? "Geral" : `${lab}Lab`}</p>
                          <p className="mt-0.5 text-[9px] text-muted-foreground">rev. {syncState.labs?.[lab] ?? 0}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">Cada alteração é enviada após um pequeno intervalo. Antes de salvar, o app recebe a revisão atual e mescla cards, pastas e preferências por identificador. Exclusões e edições concorrentes não substituem silenciosamente um Lab inteiro.</p>
                  </section>
                </div>

                <div className="hidden">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Sun className="size-4 text-primary" />
                    Tema do Aplicativo
                  </h4>
                  <div className="grid grid-cols-1 gap-1 bg-muted p-1 sm:grid-cols-3 sm:gap-0 sm:rounded-lg">
                    <Button
                      variant={theme === "light" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 gap-2 h-8"
                      onClick={() => setTheme("light")}
                    >
                      <Sun className="size-3.5" />
                      Claro
                    </Button>
                    <Button
                      variant={theme === "dark" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 gap-2 h-8"
                      onClick={() => setTheme("dark")}
                    >
                      <Moon className="size-3.5" />
                      Escuro
                    </Button>
                    <Button
                      variant={theme === "system" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 gap-2 h-8"
                      onClick={() => setTheme("system")}
                    >
                      <Laptop className="size-3.5" />
                      Sistema
                    </Button>
                  </div>
                </div>

                <div className="hidden">
                  <DisplayPreference
                    label="Cards quadrados"
                    description="Alterna as grades do VocabLab e RegencyLab entre o formato atual e o formato quadrado."
                    checked={squareCards}
                    onCheckedChange={setSquareCards}
                  />
                </div>

                <div className={cn("space-y-4", activeTab !== "regency" && "hidden")}>
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-medium"><GraduationCap className="size-4 text-primary" />Visual dos cards</h4>
                    <p className="mt-1 text-[10px] text-muted-foreground">Estas opções alteram somente a interface. Significados, contrastes, exemplos e traduções continuam sendo gerados e salvos.</p>
                  </div>
                   <DisplayPreference label="Mostrar categoria" description="Exibe a tag Verb, Noun ou Adjective nos cards e no Study." checked={showCategory} onCheckedChange={setShowCategory} />
                   <DisplayPreference label="Mostrar forma gramatical" description="Exibe Base form, Comparative, Superlative e outras flexões, sem substituir a categoria." checked={showRegencyGrammaticalForm} onCheckedChange={setShowRegencyGrammaticalForm} />
                  <DisplayPreference label="Mostrar significado" description="Exibe a explicação em português abaixo do padrão." checked={showMeaning} onCheckedChange={setShowMeaning} />
                  <DisplayPreference label="Mostrar Compare" description="Exibe o balão que diferencia construções da mesma família." checked={showContrast} onCheckedChange={setShowContrast} />
                  <DisplayPreference label="Mostrar exemplo" description="Exibe a frase de exemplo na base do card." checked={showExample} onCheckedChange={setShowExample} />
                  <DisplayPreference label="Permitir tradução" description="Exibe o botão de tradução e a área reservada para o texto em PT-BR." checked={showTranslation} onCheckedChange={setShowTranslation} />
                </div>

                <div className="hidden">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    Tema de Cores
                  </h4>
                  {resolvedTheme === "dark" ? (
                    <div className="context-bubble flex items-center gap-3 rounded-xl bg-muted/55 p-3">
                      <span className="size-4 shrink-0 rounded-full border border-white/10 bg-[#242425] shadow-inner" />
                      <div>
                        <p className="text-xs font-medium text-foreground/85">Grafite</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">O modo escuro usa uma identidade única, neutra e consistente em todas as guias.</p>
                      </div>
                    </div>
                  ) : <div className="grid grid-cols-2 gap-1 bg-muted p-1 sm:grid-cols-4 sm:gap-0 sm:rounded-lg">
                    <Button
                      variant={palette === "blue" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("blue")}
                    >
                      Azul
                    </Button>
                    <Button
                      variant={palette === "sage" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("sage")}
                    >
                      Sálvia
                    </Button>
                    <Button
                      variant={palette === "terracotta" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("terracotta")}
                    >
                      Terracota
                    </Button>
                    <Button
                      variant={palette === "ocean" ? "secondary" : "ghost"}
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setPalette("ocean")}
                    >
                      Oceano
                    </Button>
                  </div>}
                </div>

                <div className="hidden">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        Efeitos e Animações
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Ative ou desative as transições visuais dos cartões.
                      </p>
                    </div>
                    <Switch
                      checked={animationsEnabled}
                      onCheckedChange={setAnimationsEnabled}
                    />
                  </div>
                </div>

                <div className="hidden">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Clock3 className="size-4 text-primary" />
                        Cronômetro de Estudo
                      </h4>
                      <p className="text-[10px] text-muted-foreground">
                        Mostra o tempo decorrido durante as sessões de estudo.
                      </p>
                    </div>
                    <Switch checked={studyTimerEnabled} onCheckedChange={setStudyTimerEnabled} />
                  </div>
                </div>

                <div className={cn("space-y-5", activeTab !== "read" && "hidden")}>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold"><FileText className="size-4 text-primary" />Preferências do ReadLab</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Configure a leitura em voz alta de palavras, frases e trechos selecionados.</p>
                  </div>
                  <section className="space-y-4 rounded-xl border border-border/50 bg-background/55 p-4">
                    <div><h4 className="flex items-center gap-2 text-sm font-medium"><Volume2 className="size-4 text-primary" />Áudio de leitura</h4><p className="mt-0.5 text-[10px] text-muted-foreground">O áudio é gerado pelo GPT Audio Mini somente quando você clicar em reproduzir.</p></div>
                    <div className="space-y-2 border-t border-border/40 pt-4">
                      <Label className="text-sm">Voz</Label>
                      <Select value={readLabAudioVoice} onValueChange={(voice) => setReadLabAudioVoice(voice as typeof readLabAudioVoice)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Escolha a voz" /></SelectTrigger>
                        <SelectContent>{PRONUNCIATION_VOICES.map((voice) => <SelectItem key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</SelectItem>)}</SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">Esta voz é independente da pronúncia do VocabLab.</p>
                    </div>
                    <DisplayPreference label="Botão de regenerar áudio" description="Permite descartar o áudio salvo para a seleção e gerar uma nova leitura." checked={readLabShowRegenerate} onCheckedChange={setReadLabShowRegenerate} />
                  </section>
                </div>

                <div className={cn("space-y-5", activeTab !== "rule" && "hidden")}>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold"><BookOpen className="size-4 text-primary" />Preferências do RuleLab</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">O RuleLab é inteiramente manual e funciona sem IA.</p>
                  </div>
                  <section className="space-y-3 rounded-xl border border-border/50 bg-background/55 p-4">
                    <h4 className="text-sm font-medium">Review manual</h4>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">Após {reviewMistakeThreshold} {reviewMistakeThreshold === 1 ? "marcação" : "marcações"} de Again no estudo normal, o card entra no Review da pasta de origem. Um I knew it dentro do Review remove o card dessa fila.</p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">Frente e verso são campos livres: use regras, exceções, perguntas ou exemplos como preferir.</p>
                  </section>
                </div>

                <div className={cn("space-y-5", activeTab !== "vocab" && "hidden")}>
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold"><BookOpen className="size-4 text-primary" />Preferências do VocabLab</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">Controle a exibição dos cards, a criação com IA e a pronúncia em blocos separados.</p>
                  </div>

                  <section className="space-y-4 rounded-xl border border-border/50 bg-background/55 p-4">
                    <div><h4 className="text-sm font-medium">O que aparece no card</h4><p className="mt-0.5 text-[10px] text-muted-foreground">Preferências somente visuais; os dados continuam armazenados.</p></div>
                    <div className="space-y-2 border-t border-border/40 pt-4">
                      <div className="flex items-center justify-between"><Label className="text-sm">Sinônimos e antônimos</Label><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">{synonymsDisplayCount}</span></div>
                      <input type="range" min={0} max={3} step={1} value={synonymsDisplayCount} onChange={(event) => setSynonymsDisplayCount(Number(event.target.value))} className="w-full accent-primary" />
                      <p className="text-[10px] text-muted-foreground">Quantidade máxima exibida por card. Use zero para ocultar.</p>
                    </div>
                    <DisplayPreference label="Conjugações de verbos" description="Mostra os principais tempos verbais quando disponíveis." checked={includeConjugations} onCheckedChange={setIncludeConjugations} />
                    <DisplayPreference label="Outras formas" description="Quando desativado, oculta o campo e impede a geração, revisão e validação de derivações pela IA." checked={includeAlternativeForms} onCheckedChange={setIncludeAlternativeForms} />
                    <DisplayPreference label="Contexto" description="Mostra definição em inglês e explicação em português." checked={showContext} onCheckedChange={setShowContext} />
                    <DisplayPreference label="Contexto em inglês" description="Mantém a definição em inglês como principal; desative para mostrar PT-BR primeiro." checked={!contextInPortuguese} onCheckedChange={(value) => setContextInPortuguese(!value)} />
                     <DisplayPreference label="Transcrição IPA" description="Mostra a pronúncia fonética da palavra." checked={showIPA} onCheckedChange={setShowIPA} />
                     <DisplayPreference label="Formas gramaticais" description="Mostra Base form, Comparative, Superlative, Plural e flexões verbais." checked={showGrammaticalForm} onCheckedChange={setShowGrammaticalForm} />
                    <DisplayPreference label="Duas traduções" description="Mostra até duas traduções já armazenadas no card." checked={includeMultipleTranslations} onCheckedChange={setIncludeMultipleTranslations} />
                  </section>

                  <section className="space-y-4 rounded-xl border border-border/50 bg-background/55 p-4">
                    <div><h4 className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-primary" />Criação e IA</h4><p className="mt-0.5 text-[10px] text-muted-foreground">Preferências usadas ao criar ou sugerir novos cards.</p></div>
                    <div className="space-y-2 border-t border-border/40 pt-4">
                      <Label className="text-sm">Modelo de IA</Label>
                      <Select value={model} onValueChange={setModel}><SelectTrigger className="w-full"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger><SelectContent>{AVAILABLE_MODELS.map((availableModel) => <SelectItem key={availableModel.id} value={availableModel.id}>{availableModel.label}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <DisplayPreference label="Modo EFOMM (marítimo)" description="Prioriza exemplos navais, portuários e de logística quando fizer sentido." checked={efommMode} onCheckedChange={setEfommMode} />
                    <DisplayPreference label="Previsão por IA" description="Sugere palavras durante a digitação; recurso experimental." checked={useAiPredictions} onCheckedChange={setUseAiPredictions} />
                  </section>

                  <section className="space-y-4 rounded-xl border border-border/50 bg-background/55 p-4">
                    <div><h4 className="flex items-center gap-2 text-sm font-medium"><Volume2 className="size-4 text-primary" />Áudio e pronúncia</h4><p className="mt-0.5 text-[10px] text-muted-foreground">Voz usada na reprodução sob demanda.</p></div>
                    <div className="space-y-2 border-t border-border/40 pt-4"><Label className="text-sm">Voz</Label><Select value={pronunciationVoice} onValueChange={(voice) => setPronunciationVoice(voice as typeof pronunciationVoice)}><SelectTrigger className="w-full"><SelectValue placeholder="Escolha a voz" /></SelectTrigger><SelectContent>{PRONUNCIATION_VOICES.map((voice) => <SelectItem key={voice} value={voice}>{voice.charAt(0).toUpperCase() + voice.slice(1)}</SelectItem>)}</SelectContent></Select><p className="text-[10px] text-muted-foreground">Trocar a voz invalida o cache anterior e gera o próximo áudio somente após o clique.</p></div>
                    <DisplayPreference label="Botão de regenerar áudio" description="Mostra o controle para limpar o cache de uma pronúncia." checked={showRegenerateAudioButton} onCheckedChange={setShowRegenerateAudioButton} />
                  </section>

                  <section className="rounded-xl border border-border/50 bg-background/55 p-4">
                    <DisplayPreference label="Campos opcionais no formulário manual" description="Mostra exemplo, tradução do exemplo e contexto durante a criação manual." checked={showManualOptionalFields} onCheckedChange={setShowManualOptionalFields} />
                  </section>
                </div>

                <div className={cn("space-y-5", activeTab !== "wiki" && "hidden")}>
                  <SettingsWiki reviewMistakeThreshold={reviewMistakeThreshold} />
                </div>

                <div className="hidden">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <BarChart3 className="size-4 text-primary" />
                    Estatísticas de Estudo
                  </h4>
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <RotateCcw className="size-4 mr-2" />
                        Resetar estatísticas
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Resetar estatísticas?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso apagará permanentemente todo o seu histórico de estudos e progresso. 
                          Seus flashcards e pastas **não** serão afetados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive hover:bg-destructive/90"
                          onClick={resetStats}
                        >
                          Resetar agora
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    Esta ação limpa o histórico de sessões e precisão de estudo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DisplayPreference({ label, description, checked, onCheckedChange }: { label: string; description: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4"><div className="space-y-0.5"><Label className="text-sm">{label}</Label><p className="text-[10px] text-muted-foreground">{description}</p></div><Switch checked={checked} onCheckedChange={onCheckedChange} /></div>
}

function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-4"><div className="space-y-0.5"><Label className="text-sm">{label}</Label><p className="text-[10px] text-muted-foreground">{description}</p></div>{children}</div>
}

function WikiSteps({ items }: { items: string[] }) {
  return <ol className="space-y-2 pl-4 text-[12px] leading-relaxed text-muted-foreground">{items.map((item, index) => <li key={item}><span className="mr-2 font-semibold text-primary">{index + 1}.</span>{item}</li>)}</ol>
}

function StudyKeyboardShortcuts() {
  const shortcuts = [
    ["→", "I knew it (Flip Cards)"],
    ["←", "Again (Flip Cards)"],
    ["↑", "Reveal or flip the card"],
    ["↓", "Return to the front"],
  ]
  return <section className="mb-4 rounded-xl border border-primary/20 bg-primary/[0.06] p-3"><h4 className="text-xs font-semibold text-foreground">Keyboard shortcuts</h4><div className="mt-3 grid gap-2 sm:grid-cols-2">{shortcuts.map(([key, label]) => <div key={key} className="flex items-center gap-2 text-[11px] text-muted-foreground"><kbd className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-background font-mono text-sm font-semibold text-foreground shadow-sm">{key}</kbd><span>{label}</span></div>)}</div><p className="mt-3 border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted-foreground">← e → avaliam apenas no Flip Cards. No Active Recall, as setas esquerda e direita movem o cursor durante a digitação; ↑ revela a resposta e ↓ retorna à frente. No Multiple Choice, o resultado é confirmado somente pelo botão Continue.</p></section>
}

function SettingsWiki({ reviewMistakeThreshold }: { reviewMistakeThreshold: number }) {
  const reviewRule = reviewMistakeThreshold === 1
    ? "um erro"
    : `${reviewMistakeThreshold} erros`
  return <>
    <div>
      <h3 className="flex items-center gap-2 text-base font-semibold"><Library className="size-4 text-primary" />Wiki do aplicativo</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">Guia rápido de cada área, dos controles e de onde seus dados ficam salvos.</p>
    </div>
    <Accordion type="multiple" defaultValue={["start", "study"]} className="space-y-2">
      <AccordionItem value="start" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><MousePointer2 className="size-4 text-primary" />Primeiros passos e comandos</span></AccordionTrigger>
        <AccordionContent><WikiSteps items={[
          "Use a navegação superior para alternar entre VocabLab, RegencyLab, ReadLab, RuleLab e QuestionLab.",
          "Clique em uma pasta para abri-la. Clique com o botão direito em pastas ou textos para acessar ações contextuais.",
          "Passe o mouse sobre cards para revelar ações que ficam ocultas e manter a interface limpa.",
          "Na página principal do VocabLab, selecione uma pasta com o botão direito antes de gerar uma palavra.",
          "A engrenagem de cada Lab controla a visualização daquela área; a engrenagem superior abre estas configurações globais.",
        ]} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="vocab" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><BookOpen className="size-4 text-primary" />VocabLab</span></AccordionTrigger>
        <AccordionContent><WikiSteps items={[
          "Crie ou abra uma pasta e informe uma palavra ou expressão para a IA gerar um card completo.",
          "O card guarda categoria lexical e forma gramatical separadamente: greatest, por exemplo, é Adjective + Superlative.",
          "Use os controles do card para ouvir, traduzir, editar ou excluir. Áudio é produzido somente após clicar em reproduzir.",
          "Em Study, escolha Active Recall, Flip Cards ou Multiple Choice. A ordem dos cards e das alternativas é embaralhada.",
          `Cards que atingem ${reviewRule} entram no fluxo de Review. A pasta de revisão reúne o conteúdo que precisa de reforço.`,
          "Phrasal Verbs Essentials e Idioms Essentials são catálogos iniciais curados; seus cards podem ser editados, movidos ou excluídos normalmente.",
          "Ao excluir uma pasta, escolha transferir seus cards para outra pasta ou excluí-los junto com ela.",
        ]} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="regency" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><GraduationCap className="size-4 text-primary" />RegencyLab</span></AccordionTrigger>
        <AccordionContent><WikiSteps items={[
          "Cada card ensina uma construção: termo, categoria, forma gramatical, padrão, significado, contraste com padrões irmãos, exemplo e tradução.",
          "A IA gera e revisa a família como conjunto para distinguir usos próximos sem criar contrastes artificiais.",
          "Regency Essentials é o catálogo inicial curado; seus cards continuam editáveis, transferíveis e excluíveis.",
          "O ícone de tradução revela a tradução sem mudar o tamanho do card. As opções desta guia apenas ocultam ou exibem dados já salvos.",
          "Os três modos de Study seguem o mesmo fluxo do VocabLab. Multiple Choice usa padrões da mesma família como alternativas plausíveis.",
          `Ao atingir ${reviewRule}, o card também entra no Review do RegencyLab.`,
        ]} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="read" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><FileText className="size-4 text-primary" />ReadLab</span></AccordionTrigger>
        <AccordionContent><WikiSteps items={[
          "Crie uma pasta e adicione um texto digitando, colando ou usando os recursos de processamento disponíveis.",
          "Dentro do texto, selecione uma palavra ou trecho para abrir tradução, marca-texto, áudio e, em seleções curtas, Add Card para o VocabLab.",
          "Ao criar um card, o ReadLab envia a frase original para a IA distinguir formas como Comparative, Superlative, Plural e particípios.",
          "O pop-up escolhe automaticamente o espaço acima ou abaixo da seleção e usa rolagem própria em conteúdos extensos.",
          "Clique com o botão direito no card de um texto para renomear, aplicar ou remover tags.",
          "Na engrenagem do ReadLab, escolha texto original, justificado ou coluna de meia tela. Essa escolha não altera os outros Labs.",
          "O áudio usa configuração e cache próprios; a leitura pode abranger desde uma palavra até um trecho longo.",
        ]} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="rule" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><BookOpen className="size-4 text-primary" />RuleLab</span></AccordionTrigger>
        <AccordionContent><WikiSteps items={[
          "RuleLab é um espaço manual e offline para regras, exceções, perguntas e exemplos. Ele não usa IA.",
          "Crie uma pasta e adicione cards com Frente e Verso; os dois campos aceitam texto livre e várias linhas.",
          "Use Flip Cards ou Active Recall para estudar. A ordem dos cards é embaralhada em cada sessão.",
          `Ao atingir ${reviewRule} no estudo normal, o card entra em Review. Acertá-lo dentro de Review remove-o dessa fila.`,
          "Pastas e cards podem ser renomeados, recoloridos, transferidos, editados ou excluídos como nos demais Labs.",
        ]} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="study" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><BrainCircuit className="size-4 text-primary" />Study, progresso e QuestionLab</span></AccordionTrigger>
        <AccordionContent><StudyKeyboardShortcuts /><WikiSteps items={[
          "Active Recall pede que você formule a resposta antes de revelar; Flip Cards usa frente e verso; Multiple Choice pede a alternativa correta.",
          "Again registra erro e recoloca o conteúdo no ciclo; I knew it registra acerto e avança.",
          `O limite atual para enviar um card ao Review é ${reviewRule}; ele pode ser alterado em Geral > Experiência de estudo.`,
          "Multiple Choice exige pelo menos 10 cards e quatro respostas distintas na própria pasta ou fila de Review.",
          "Efeitos direcionais obedecem ao toggle de animações, e o cronômetro obedece à preferência geral.",
          "QuestionLab permanece temporariamente desativado; sua página continua acessível e mostra o aviso de indisponibilidade.",
          "Resetar estatísticas apaga somente histórico e métricas de estudo, nunca os cards ou pastas.",
        ]} /></AccordionContent>
      </AccordionItem>

      <AccordionItem value="data" className="rounded-xl border border-border/50 bg-background/55 px-4">
        <AccordionTrigger className="text-sm"><span className="flex items-center gap-2"><Database className="size-4 text-primary" />Dados, sincronização, IA e áudio</span></AccordionTrigger>
        <AccordionContent><WikiSteps items={[
          "Cards, pastas e textos ficam no IndexedDB deste navegador. Preferências e pequenos caches ficam no armazenamento local.",
          "Na guia Sincronização, escolha uma palavra, preserve o PIN gerado e clique em Confirmar. Os campos ficam bloqueados e a sincronização começa.",
          "Use Desbloquear e trocar dados para conectar outra identificação. O envio e recebimento ficam pausados enquanto palavra e PIN estiverem editáveis.",
          "Se a combinação já estiver ocupada, o app bloqueia qualquer acesso. Para um aparelho legítimo, gere no navegador autorizado um código de pareamento válido por cinco minutos.",
          "A sincronização é contínua e separada por Lab: o app recebe a revisão remota, mescla por card ou pasta e só então envia suas alterações.",
          "Se dois dispositivos atualizarem ao mesmo tempo, o controle de revisão impede que um retrato antigo sobrescreva silenciosamente o outro.",
          "A IA só é chamada por ações que precisam gerar, revisar, traduzir ou narrar conteúdo; preferências visuais não regeneram dados.",
          "No áudio, a chave de cache combina texto e voz. Reproduzir novamente usa o arquivo local; regenerar remove apenas aquela entrada.",
          "O cache do VocabLab e o cache do ReadLab são independentes. Trocar a voz do ReadLab não altera a voz do VocabLab.",
          "Como o armazenamento é local, outro navegador ou dispositivo cria seus próprios caches de áudio.",
        ]} /></AccordionContent>
      </AccordionItem>
    </Accordion>
  </>
}
