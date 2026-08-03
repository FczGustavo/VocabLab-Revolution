"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Activity, Gauge, Loader2, RefreshCcw, Server } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ServiceStatus = {
  id: string
  area: string
  name: string
  model: string
  kind: "text" | "audio"
  operational: boolean
  latencyMs: number | null
  tokensPerSecond: number | null
  outputTokens: number | null
  error: string | null
}

type StatusResponse = {
  provider: { operational: boolean; latencyMs: number | null; error: string | null }
  checkedAt: number
  benchmarked?: boolean
  graniteFailover?: {
    active: boolean
    backupModel: string
    openUntil: number | null
    degradedSamples: number
    degradedSamplesThreshold: number
    latencyThresholdMs: number
    tokensPerSecondThreshold: number
    lastLatencyMs: number | null
    lastTokensPerSecond: number | null
  }
  services: ServiceStatus[]
}

export function AiStatusPanel() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [benchmarking, setBenchmarking] = useState(false)

  const load = useCallback(async (benchmark = false) => {
    if (benchmark) setBenchmarking(true)
    else setLoading(true)
    try {
      const response = await fetch(`/api/ai/status${benchmark ? "?benchmark=1" : ""}`, { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload) throw new Error(payload?.error ?? "Falha ao consultar as IAs.")
      setData(payload)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
      setBenchmarking(false)
    }
  }, [])

  useEffect(() => { load(false) }, [load])
  const operationalCount = useMemo(() => data?.services.filter((service) => service.operational).length ?? 0, [data])

  return <section className="overflow-hidden rounded-xl border border-border/50 bg-background/55 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h4 className="flex items-center gap-2 text-sm font-medium"><Activity className="size-4 shrink-0 text-primary" />Saúde das IAs</h4><p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">Disponibilidade do catálogo e desempenho medido por chamadas mínimas reais.</p></div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" onClick={() => load(false)} disabled={loading || benchmarking}><RefreshCcw className={cn("mr-1.5 size-3.5", loading && "animate-spin")} />Atualizar</Button>
        <Button size="sm" variant="outline" onClick={() => load(true)} disabled={loading || benchmarking}>{benchmarking ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Gauge className="mr-1.5 size-3.5" />}Benchmark</Button>
      </div>
    </div>
    {data && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Metric label="Provedor" value={data.provider.operational ? "Operacional" : "Indisponível"} good={data.provider.operational} />
      <Metric label="Serviços" value={`${operationalCount}/${data.services.length}`} good={operationalCount === data.services.length} />
      <Metric label="Latência API" value={data.provider.latencyMs == null ? "—" : `${data.provider.latencyMs} ms`} />
    </div>}
    {data?.graniteFailover && <div className={cn("break-words rounded-lg border px-3 py-2 text-[10px] leading-relaxed [overflow-wrap:anywhere]", data.graniteFailover.active ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-border/40 bg-muted/25 text-muted-foreground")}><span className="font-semibold">Granite:</span> {data.graniteFailover.active ? `backup ativo (${data.graniteFailover.backupModel})` : "modelo principal ativo"}<span className="ml-1 opacity-80">· troca após {data.graniteFailover.degradedSamples}/{data.graniteFailover.degradedSamplesThreshold} amostras degradadas · limite {data.graniteFailover.latencyThresholdMs}ms e &lt;{data.graniteFailover.tokensPerSecondThreshold} tok/s</span></div>}
    {!data && loading ? <div className="flex h-28 items-center justify-center text-xs text-muted-foreground"><Loader2 className="mr-2 size-4 animate-spin" />Verificando serviços…</div> : null}
    {data && <div className="overflow-hidden rounded-lg border border-border/50">
      <div className="hidden grid-cols-[1.25fr_0.85fr_64px_64px] gap-2 bg-muted/40 px-3 py-2 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid"><span>Serviço</span><span>Modelo</span><span className="text-right">Latência</span><span className="text-right">tok/s</span></div>
      <div>
        {data.services.map((service) => <div key={service.id} className="grid grid-cols-2 items-start gap-x-3 gap-y-2 border-t border-border/35 px-3 py-2.5 text-[10px] sm:grid-cols-[1.25fr_0.85fr_64px_64px] sm:items-center sm:gap-2">
          <div className="col-span-2 min-w-0 sm:col-span-1"><div className="flex items-start gap-1.5"><span className={cn("mt-0.5 size-1.5 shrink-0 rounded-full", service.operational ? "bg-emerald-500" : "bg-destructive")} /><span className="break-words font-medium leading-snug [overflow-wrap:anywhere]">{service.name}</span></div><span className="pl-3 text-[9px] leading-snug text-muted-foreground">{service.area}</span></div>
          <span className="col-span-2 min-w-0 break-words text-[9px] leading-snug text-muted-foreground [overflow-wrap:anywhere] sm:col-span-1" title={service.model}><span className="mr-1 uppercase tracking-wide text-muted-foreground/70 sm:hidden">Modelo:</span>{service.model.split("/").pop()}</span>
          <span className="text-left tabular-nums text-muted-foreground sm:text-right"><span className="mr-1 uppercase tracking-wide text-muted-foreground/70 sm:hidden">Latência:</span>{service.latencyMs == null ? "—" : `${service.latencyMs}ms`}</span>
          <span className="text-right tabular-nums text-muted-foreground"><span className="mr-1 uppercase tracking-wide text-muted-foreground/70 sm:hidden">tok/s:</span>{service.kind === "audio" ? "áudio" : service.tokensPerSecond ?? "—"}</span>
        </div>)}
      </div>
    </div>}
    <p className="break-words text-[9px] leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">“Atualizar” não gera conteúdo: consulta o catálogo do provedor. “Benchmark” consome poucos tokens e mede cada modelo textual único. tok/s não se aplica aos modelos de áudio.</p>
  </section>
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return <div className="min-w-0 rounded-lg bg-muted/35 p-2.5"><div className="flex min-w-0 items-center gap-1 text-[9px] text-muted-foreground"><Server className="size-3 shrink-0" /><span className="break-words leading-snug [overflow-wrap:anywhere]">{label}</span></div><p className={cn("mt-1 break-words text-xs font-semibold leading-snug [overflow-wrap:anywhere]", good === true && "text-emerald-600 dark:text-emerald-400", good === false && "text-destructive")}>{value}</p></div>
}
