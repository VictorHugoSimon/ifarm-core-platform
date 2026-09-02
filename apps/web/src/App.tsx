const modules = [
  'Core', 'IoT', 'Logistics', 'Services', 'Store', 'Finance', 'Insurance', 'Academy'
]

const kpis = [
  ['Propriedades', '0'],
  ['Usuários ativos', '0'],
  ['Tenants', '0'],
  ['Integrações', '0']
]

export function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">iFarm <span>Core</span></div>
        <nav>
          {modules.map((module) => <a key={module} href="#">{module}</a>)}
        </nav>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">NÚCLEO DA PLATAFORMA</p>
            <h1>Visão executiva</h1>
            <p className="muted">Fundação multiempresa para todo o ecossistema iFarm.</p>
          </div>
          <div className="badge">DEV</div>
        </header>

        <section className="kpis">
          {kpis.map(([label, value]) => (
            <article key={label}>
              <p>{label}</p>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className="panel">
          <div>
            <p className="eyebrow">SPRINT 0</p>
            <h2>Fundação técnica em construção</h2>
          </div>
          <ul>
            <li>API v1 e health check</li>
            <li>Modelo relacional multi-tenant</li>
            <li>RBAC e auditoria preparados no banco</li>
            <li>Branches DEV / STAGE / PRODUCTION</li>
          </ul>
        </section>
      </main>
    </div>
  )
}
