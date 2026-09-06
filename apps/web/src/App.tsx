import { FormEvent, useEffect, useMemo, useState } from 'react'
import { authClient } from './auth-client'

const moduleNames = ['Core', 'IoT', 'Logistics', 'Services', 'Store', 'Finance', 'Insurance', 'Academy']
const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const authConfigured = Boolean(import.meta.env.VITE_NEON_AUTH_URL)

type Financial = {
  currency: string
  mrrCents: number
  arrCents: number
  revenueForecastNext12MonthsCents: number
  revenueReceivedYtdCents: number
}

type TenantModule = {
  code: string
  name: string
  status: string
  contractId?: string | null
  startsOn?: string
  endsOn?: string | null
}

type ModuleDistribution = {
  code: string
  name: string
  activeTenants: number
}

type DashboardSummary = {
  scope: 'tenant' | 'ifarm-admin'
  tenantId?: string
  generatedAt: string
  counts: Record<string, number>
  financialByCurrency: Financial[]
  modules?: TenantModule[]
  moduleDistribution?: ModuleDistribution[]
  alerts: Record<string, number>
}

type MeResponse = {
  id: string
  email?: string
  role?: string | null
  ifarmAdmin: boolean
  tenantId?: string | null
  mfa: { required: boolean; verified: boolean; satisfied: boolean }
}

const countLabels: Record<string, string> = {
  tenants: 'Tenants',
  activeTenants: 'Tenants ativos',
  organizations: 'Organizações',
  properties: 'Propriedades',
  activeUsers: 'Usuários ativos',
  partners: 'Parceiros',
  documents: 'Documentos',
  integrations: 'Integrações',
  activeContracts: 'Contratos ativos',
  activeModules: 'Módulos ativos'
}

const alertLabels: Record<string, string> = {
  contractsExpiring30Days: 'Contratos vencendo em 30 dias',
  integrationsError: 'Integrações com erro',
  invitationsExpiring48h: 'Convites vencendo em 48h',
  unreadNotifications: 'Notificações não lidas',
  pendingInvitations: 'Convites pendentes'
}

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }
}

async function apiRequest<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const message = typeof payload.message === 'string' ? payload.message : 'Não foi possível carregar os dados.'
    throw new Error(message)
  }
  return payload as T
}

function Login() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = mode === 'sign-in'
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name.trim() || email.split('@')[0] })
      if (result.error) throw new Error(result.error.message || 'Falha na autenticação.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha na autenticação.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <div className="brand brand-large">iFarm <span>Core</span></div>
        <p className="eyebrow">PLATAFORMA CENTRAL</p>
        <h1>{mode === 'sign-in' ? 'Acessar o Core' : 'Criar sua conta'}</h1>
        <p className="muted">Identidade central, propriedades, parceiros, contratos, módulos e indicadores do ecossistema iFarm.</p>
        {!authConfigured && <div className="error-box">VITE_NEON_AUTH_URL ainda não foi configurada para este ambiente.</div>}
        <form onSubmit={submit}>
          {mode === 'sign-up' && (
            <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
          )}
          <label>E-mail<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
          <label>Senha<input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} /></label>
          {error && <div className="error-box">{error}</div>}
          <button className="primary-button" type="submit" disabled={busy || !authConfigured}>{busy ? 'Processando…' : mode === 'sign-in' ? 'Entrar' : 'Criar conta'}</button>
        </form>
        <button className="link-button" type="button" onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}>
          {mode === 'sign-in' ? 'Primeiro acesso? Criar conta' : 'Já possui conta? Entrar'}
        </button>
        <p className="auth-note">O acesso ao tenant depende de membership ativa. Convites só podem ser aceitos pelo e-mail verificado correspondente.</p>
      </section>
    </div>
  )
}

export function App() {
  const session = authClient.useSession()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadDashboard() {
    setLoading(true)
    setError(null)
    try {
      const token = await authClient.getJWTToken()
      if (!token) throw new Error('Sessão sem token de acesso. Entre novamente.')
      const mePayload = await apiRequest<MeResponse>('/api/v1/me', token)
      setMe(mePayload)
      const path = mePayload.ifarmAdmin ? '/api/v1/admin/dashboard/summary' : '/api/v1/dashboard/summary'
      const payload = await apiRequest<{ summary: DashboardSummary }>(path, token)
      setSummary(payload.summary)
    } catch (cause) {
      setSummary(null)
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (session.data) void loadDashboard()
    else {
      setSummary(null)
      setMe(null)
    }
  }, [session.data])

  const moduleStatus = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of summary?.modules ?? []) map.set(item.name.replace('iFarm ', ''), item.status)
    for (const item of summary?.moduleDistribution ?? []) map.set(item.name.replace('iFarm ', ''), item.activeTenants > 0 ? `${item.activeTenants} tenant(s)` : 'sem contratos')
    return map
  }, [summary])

  if (session.isPending) return <div className="center-state">Carregando sessão segura…</div>
  if (!session.data) return <Login />

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">iFarm <span>Core</span></div>
        <p className="sidebar-caption">Ecossistema</p>
        <nav>
          {moduleNames.map((module) => (
            <a key={module} href={`#module-${module.toLowerCase()}`}>
              <span>{module}</span><small>{moduleStatus.get(module) ?? '—'}</small>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <strong>{session.data.user.name || session.data.user.email}</strong>
          <small>{me?.ifarmAdmin ? 'Administrador iFarm' : me?.role || 'Usuário Core'}</small>
          <button className="secondary-button" onClick={() => void authClient.signOut()}>Sair</button>
        </div>
      </aside>

      <main>
        <header className="page-header">
          <div>
            <p className="eyebrow">{summary?.scope === 'ifarm-admin' ? 'ADMINISTRAÇÃO IFARM' : 'NÚCLEO DA PLATAFORMA'}</p>
            <h1>Visão executiva</h1>
            <p className="muted">Indicadores calculados a partir das entidades compartilhadas do iFarm Core.</p>
          </div>
          <div className="header-actions">
            <div className="badge">{import.meta.env.MODE.toUpperCase()}</div>
            <button className="secondary-button" disabled={loading} onClick={() => void loadDashboard()}>{loading ? 'Atualizando…' : 'Atualizar'}</button>
          </div>
        </header>

        {me?.mfa.required && !me.mfa.satisfied && (
          <div className="warning-box">Este perfil exige MFA. Operações privilegiadas permanecem bloqueadas até o segundo fator ser validado.</div>
        )}
        {error && <div className="error-box">{error}</div>}

        {summary ? (
          <>
            <section className="kpis">
              {Object.entries(summary.counts).map(([key, value]) => (
                <article key={key}><p>{countLabels[key] ?? key}</p><strong>{value.toLocaleString('pt-BR')}</strong></article>
              ))}
            </section>

            <section className="section-grid">
              <article className="panel financial-panel">
                <div className="panel-heading"><div><p className="eyebrow">RECEITA</p><h2>Indicadores financeiros</h2></div><span className="data-note">calculados</span></div>
                {summary.financialByCurrency.length === 0 ? <p className="empty-state">Nenhum contrato financeiro registrado.</p> : summary.financialByCurrency.map((item) => (
                  <div className="financial-grid" key={item.currency}>
                    <div><span>MRR</span><strong>{money(item.mrrCents, item.currency)}</strong></div>
                    <div><span>ARR</span><strong>{money(item.arrCents, item.currency)}</strong></div>
                    <div><span>Previsto · 12 meses</span><strong>{money(item.revenueForecastNext12MonthsCents, item.currency)}</strong></div>
                    <div><span>Recebido · ano</span><strong>{money(item.revenueReceivedYtdCents, item.currency)}</strong></div>
                  </div>
                ))}
              </article>

              <article className="panel alerts-panel">
                <div className="panel-heading"><div><p className="eyebrow">ATENÇÃO</p><h2>Alertas</h2></div></div>
                <div className="alert-list">
                  {Object.entries(summary.alerts).map(([key, value]) => (
                    <div key={key} className={value > 0 ? 'alert-row attention' : 'alert-row'}><span>{alertLabels[key] ?? key}</span><strong>{value}</strong></div>
                  ))}
                </div>
              </article>
            </section>

            <section className="panel modules-panel">
              <div className="panel-heading"><div><p className="eyebrow">PORTFÓLIO</p><h2>Módulos iFarm</h2></div></div>
              <div className="module-grid">
                {(summary.modules ?? summary.moduleDistribution ?? []).map((item) => {
                  const status = 'status' in item ? item.status : `${item.activeTenants} tenant(s)`
                  return <div id={`module-${item.name.replace('iFarm ', '').toLowerCase()}`} className="module-card" key={item.code}><strong>{item.name}</strong><span>{status}</span></div>
                })}
              </div>
            </section>

            <p className="refresh-note">Atualizado em {new Date(summary.generatedAt).toLocaleString('pt-BR')}. Valores financeiros são derivados de contratos e lançamentos, não de números manuais.</p>
          </>
        ) : (
          <div className="center-state">{loading ? 'Carregando indicadores…' : 'Dashboard indisponível para o contexto atual.'}</div>
        )}
      </main>
    </div>
  )
}
