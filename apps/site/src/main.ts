import './styles.css'

type LeadResponse = {
  ok?: boolean
  id?: string
  error?: string
  message?: string
}

const form = document.querySelector<HTMLFormElement>('#lead-form')
const status = document.querySelector<HTMLElement>('#form-status')

const getString = (data: FormData, key: string) => {
  const value = data.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  const data = new FormData(form)
  const apiBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

  const payload = {
    name: getString(data, 'name'),
    email: getString(data, 'email'),
    phone: getString(data, 'phone') || undefined,
    organization: getString(data, 'organization') || undefined,
    profile: getString(data, 'profile'),
    message: getString(data, 'message'),
    privacyConsent: data.get('privacyConsent') === 'on',
    website: getString(data, 'website'),
    source: 'smart-farm-site'
  }

  try {
    if (button) {
      button.disabled = true
      button.textContent = 'Enviando...'
    }
    if (status) status.textContent = ''

    const response = await fetch(`${apiBase}/api/v1/public/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const body = await response.json() as LeadResponse

    if (!response.ok) {
      throw new Error(body.message || 'Não foi possível registrar seu interesse.')
    }

    form.reset()
    if (status) {
      status.className = 'form-status success'
      status.textContent = 'Recebemos sua mensagem. A equipe iFarm poderá entrar em contato pelos dados informados.'
    }
  } catch (error) {
    if (status) {
      status.className = 'form-status error'
      status.textContent = error instanceof Error ? error.message : 'Falha ao enviar. Tente novamente.'
    }
  } finally {
    if (button) {
      button.disabled = false
      button.textContent = 'Enviar interesse'
    }
  }
})
