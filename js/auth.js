function LoadingScreen() {
  return React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', width:'100%', background:'#FAFBFA', gap:16 } },
    React.createElement('style', null, '@keyframes sb-spin{to{transform:rotate(360deg)}}'),
    React.createElement('div', { style:{ width:44, height:44, border:'4px solid #E2E8E2', borderTop:'4px solid #0A6B52', borderRadius:'50%', animation:'sb-spin .8s linear infinite' } }),
    React.createElement('p', { style:{ color:'#64748B', fontSize:14 } }, '読み込み中...')
  )
}

function LoginScreen({ onAuth }) {
  const [mode,     setMode]     = React.useState('login')
  const [email,    setEmail]    = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading,  setLoading]  = React.useState(false)
  const [error,    setError]    = React.useState('')
  const [success,  setSuccess]  = React.useState('')
  const inp  = { width:'100%', padding:'8px 12px', border:'1px solid #D8E0DA', borderRadius:6, fontSize:14, outline:'none', boxSizing:'border-box' }
  const lbl  = { display:'block', marginBottom:14 }
  const spn  = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }
  const DEMO_EMAIL = 'demo@syatyo-suport.jp'
  const DEMO_PASS  = 'demo1234'
  const fillDemo = () => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASS); setError(''); setSuccess('') }

  const handle = async (e) => {
    e.preventDefault(); setLoading(true); setError(''); setSuccess('')
    try {
      if (mode === 'login') {
        const { data, error:err } = await sb.auth.signInWithPassword({ email, password })
        if (err) throw err; onAuth(data.user)
      } else {
        const { error:err } = await sb.auth.signUp({ email, password })
        if (err) throw err
        setSuccess('確認メールを送信しました。メールのリンクをクリック後にログインしてください。')
      }
    } catch(err) {
      setError(err.message === 'Invalid login credentials' ? 'メールまたはパスワードが正しくありません' : err.message)
    } finally { setLoading(false) }
  }
  return React.createElement('div', { style:{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', width:'100%', background:'#FAFBFA' } },
    React.createElement('div', { style:{ background:'#fff', borderRadius:12, padding:40, width:380, boxShadow:'0 4px 24px rgba(10,107,82,.12)', border:'1px solid #DDE8DE' } },
      React.createElement('div', { style:{ textAlign:'center', marginBottom:28 } },
        React.createElement('div', { style:{ fontSize:36, marginBottom:8 } }, '🌱'),
        React.createElement('h1', { style:{ fontSize:20, fontWeight:700, color:'#111827', margin:'0 0 4px' } }, '農場管理システム'),
        React.createElement('p', { style:{ color:'#64748B', fontSize:13, margin:0 } }, mode === 'login' ? 'ログイン' : '新規登録')
      ),

      // デモアカウント案内
      mode === 'login' && React.createElement('div', { style:{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'10px 14px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 } },
        React.createElement('div', null,
          React.createElement('div', { style:{ fontSize:11, fontWeight:700, color:'#166534', marginBottom:2 } }, '🌿 デモアカウント'),
          React.createElement('div', { style:{ fontSize:11, color:'#4B5563', fontFamily:'monospace' } }, DEMO_EMAIL),
          React.createElement('div', { style:{ fontSize:11, color:'#4B5563', fontFamily:'monospace' } }, DEMO_PASS)
        ),
        React.createElement('button', {
          type:'button', onClick:fillDemo,
          style:{ padding:'6px 12px', background:'#0A6B52', color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }
        }, '入力する')
      ),

      React.createElement('form', { onSubmit:handle },
        React.createElement('label', { style:lbl }, React.createElement('span', { style:spn }, 'メールアドレス'), React.createElement('input', { type:'email', value:email, onChange:e=>setEmail(e.target.value), required:true, placeholder:'farm@example.com', style:inp })),
        React.createElement('label', { style:{...lbl, marginBottom:20} }, React.createElement('span', { style:spn }, 'パスワード'), React.createElement('input', { type:'password', value:password, onChange:e=>setPassword(e.target.value), required:true, minLength:6, placeholder:'6文字以上', style:inp })),
        error   && React.createElement('div', { style:{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#DC2626' } }, error),
        success && React.createElement('div', { style:{ background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#15803D' } }, success),
        React.createElement('button', { type:'submit', disabled:loading, style:{ width:'100%', padding:10, background:loading?'#6EE7B7':'#0A6B52', color:'#fff', border:'none', borderRadius:6, fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer' } }, loading ? '処理中...' : (mode==='login' ? 'ログイン' : '登録する'))
      ),
      React.createElement('div', { style:{ textAlign:'center', marginTop:16 } },
        React.createElement('button', { onClick:()=>{ setMode(mode==='login'?'signup':'login'); setError(''); setSuccess('') }, style:{ background:'none', border:'none', color:'#0A6B52', cursor:'pointer', fontSize:13, fontWeight:600 } }, mode==='login' ? 'アカウントをお持ちでない方はこちら' : 'すでにアカウントをお持ちの方')
      )
    )
  )
}

function OnboardingScreen({ user, onComplete }) {
  const [step,     setStep]     = React.useState(1)
  const [orgType,  setOrgType]  = React.useState('solo')
  const [orgName,  setOrgName]  = React.useState('')
  const [farmName, setFarmName] = React.useState('')
  const [jgapNo,   setJgapNo]   = React.useState('')
  const [loading,  setLoading]  = React.useState(false)
  const [error,    setError]    = React.useState('')
  const inp = { width:'100%', padding:'8px 12px', border:'1px solid #D8E0DA', borderRadius:6, fontSize:14, boxSizing:'border-box', outline:'none' }
  const lbl = { display:'block', marginBottom:14 }
  const spn = { fontSize:12, fontWeight:600, color:'#374151', display:'block', marginBottom:4 }
  const card = (sel) => ({ padding:20, border:`2px solid ${sel?'#0A6B52':'#E2E8E2'}`, borderRadius:8, background:sel?'#F0FDF4':'#fff', cursor:'pointer', textAlign:'left', width:'100%' })
  const wrapStyle = { display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', width:'100%', background:'#FAFBFA' }
  const boxStyle  = { background:'#fff', borderRadius:12, padding:40, boxShadow:'0 4px 24px rgba(10,107,82,.12)', border:'1px solid #DDE8DE' }
  const handleCreate = async (e) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { data:orgs, error:orgErr } = await sb.from('farm_organizations').insert({ name:orgName, type:orgType, jgap_cert_no:jgapNo }).select()
      if (orgErr) throw orgErr
      const org = orgs[0]
      const { data:farms, error:farmErr } = await sb.from('farm_farms').insert({ org_id:org.id, name:(orgType==='solo' ? (farmName||orgName) : farmName), jgap_cert_no:jgapNo }).select()
      if (farmErr) throw farmErr
      onComplete(org, farms[0])
    } catch(err) { setError(err.message) } finally { setLoading(false) }
  }
  if (step === 1) return React.createElement('div', { style:wrapStyle },
    React.createElement('div', { style:{...boxStyle, width:500} },
      React.createElement('div', { style:{ textAlign:'center', marginBottom:28 } }, React.createElement('div', { style:{fontSize:36,marginBottom:8} }, '🌱'), React.createElement('h2', { style:{fontSize:20,fontWeight:700,color:'#111827',margin:'0 0 4px'} }, 'ようこそ！'), React.createElement('p', { style:{color:'#64748B',fontSize:13,margin:0} }, '農場の管理形態を選択してください')),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 } },
        React.createElement('button', { onClick:()=>setOrgType('solo'), style:card(orgType==='solo') }, React.createElement('div', { style:{fontSize:28,marginBottom:10} }, '🏡'), React.createElement('div', { style:{fontSize:14,fontWeight:700,color:'#111827',marginBottom:4} }, '個人・単一農場'), React.createElement('div', { style:{fontSize:12,color:'#64748B',lineHeight:1.5} }, '農家・個人事業主として1農場を管理')),
        React.createElement('button', { onClick:()=>setOrgType('corp'), style:card(orgType==='corp') }, React.createElement('div', { style:{fontSize:28,marginBottom:10} }, '🏢'), React.createElement('div', { style:{fontSize:14,fontWeight:700,color:'#111827',marginBottom:4} }, '農業法人・組合'), React.createElement('div', { style:{fontSize:12,color:'#64748B',lineHeight:1.5} }, '複数農場を法人として一元管理'))
      ),
      React.createElement('button', { onClick:()=>setStep(2), style:{ width:'100%', padding:10, background:'#0A6B52', color:'#fff', border:'none', borderRadius:6, fontSize:14, fontWeight:600, cursor:'pointer' } }, '次へ →')
    )
  )
  return React.createElement('div', { style:wrapStyle },
    React.createElement('div', { style:{...boxStyle, width:440} },
      React.createElement('button', { onClick:()=>setStep(1), style:{ background:'none', border:'none', color:'#0A6B52', cursor:'pointer', fontSize:13, marginBottom:16, padding:0 } }, '← 戻る'),
      React.createElement('h2', { style:{ fontSize:18, fontWeight:700, color:'#111827', marginBottom:20 } }, orgType==='solo' ? '🏡 農場情報を入力' : '🏢 法人・農場情報を入力'),
      React.createElement('form', { onSubmit:handleCreate },
        React.createElement('label', { style:lbl }, React.createElement('span', { style:spn }, orgType==='solo' ? '農場名 *' : '法人名（組合名）*'), React.createElement('input', { type:'text', value:orgName, onChange:e=>setOrgName(e.target.value), required:true, placeholder:orgType==='solo'?'例: 田中農園':'例: 農事組合法人○○', style:inp })),
        orgType==='corp' && React.createElement('label', { style:lbl }, React.createElement('span', { style:spn }, '最初の農場名 *'), React.createElement('input', { type:'text', value:farmName, onChange:e=>setFarmName(e.target.value), required:true, placeholder:'例: 第1農場', style:inp })),
        React.createElement('label', { style:{...lbl, marginBottom:20} }, React.createElement('span', { style:spn }, 'JGAP認証番号（任意）'), React.createElement('input', { type:'text', value:jgapNo, onChange:e=>setJgapNo(e.target.value), placeholder:'JGAP-XXXX-XXXXX', style:inp })),
        error && React.createElement('div', { style:{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:13, color:'#DC2626' } }, error),
        React.createElement('button', { type:'submit', disabled:loading, style:{ width:'100%', padding:10, background:loading?'#6EE7B7':'#0A6B52', color:'#fff', border:'none', borderRadius:6, fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer' } }, loading ? '作成中...' : 'セットアップ完了 →')
      )
    )
  )
}

function Root() {
  const [authStatus,     setAuthStatus]     = React.useState('loading')
  const [authUser,       setAuthUser]       = React.useState(null)
  const [currentOrg,     setCurrentOrg]     = React.useState(null)
  const [currentFarm,    setCurrentFarm]    = React.useState(null)
  const [availableFarms, setAvailableFarms] = React.useState([])
  const loadTenantContext = React.useCallback(async (user) => {
    try {
      const { data:members } = await sb.from('farm_members').select('org_id, role, farm_ids, farm_organizations(id, name, type, jgap_cert_no)').eq('user_id', user.id).limit(1)
      if (!members || members.length === 0) { setAuthStatus('onboarding'); return }
      const org = members[0].farm_organizations
      setCurrentOrg(org)
      const { data:farms } = await sb.from('farm_farms').select('*').eq('org_id', org.id).order('created_at')
      if (!farms || farms.length === 0) { setAuthStatus('onboarding'); return }
      setAvailableFarms(farms)
      const savedId = localStorage.getItem('last_farm_' + org.id)
      const farm = farms.find(f => f.id === savedId) || farms[0]
      setCurrentFarm(farm)
      setAuthStatus('ready')
    } catch(err) { console.error('tenant ctx:', err); setAuthStatus('unauthenticated') }
  }, [])
  React.useEffect(() => {
    sb.auth.getSession().then(({ data:{ session } }) => {
      if (!session) { setAuthStatus('unauthenticated'); return }
      setAuthUser(session.user); loadTenantContext(session.user)
    })
    const { data:{ subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (!session) { setAuthStatus('unauthenticated'); setAuthUser(null); setCurrentOrg(null); setCurrentFarm(null) }
    })
    return () => subscription.unsubscribe()
  }, [loadTenantContext])
  const handleFarmChange = (farm) => {
    setCurrentFarm(farm)
    if (currentOrg) localStorage.setItem('last_farm_' + currentOrg.id, farm.id)
  }
  if (authStatus === 'loading')         return React.createElement(LoadingScreen)
  if (authStatus === 'unauthenticated') return React.createElement(LoginScreen, { onAuth:(u)=>{ setAuthUser(u); loadTenantContext(u) } })
  if (authStatus === 'onboarding')      return React.createElement(OnboardingScreen, { user:authUser, onComplete:(org, farm)=>{ setCurrentOrg(org); setCurrentFarm(farm); setAvailableFarms([farm]); setAuthStatus('ready') } })
  return React.createElement(App, {
    key:           currentFarm.id,
    currentOrg,
    currentFarm,
    availableFarms,
    authUser,
    onFarmChange:  handleFarmChange,
    onSignOut:     async () => { await sb.auth.signOut() },
  })
}
