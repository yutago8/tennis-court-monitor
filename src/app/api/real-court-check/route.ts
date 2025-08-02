import { NextRequest, NextResponse } from 'next/server'

interface CourtAvailability {
  park: string
  court: string
  date: string
  time: string
  status: 'available' | 'unavailable'
  lastChecked: string
}

const LOGIN_URL = "https://kouen.sports.metro.tokyo.lg.jp/web/rsvWUserAttestationLoginAction.do"
const USER_ID = "10010139"
const PASSWORD = "20Tomato24dayo/"

export async function POST(request: NextRequest) {
  try {
    const { parks, timeSlots, dates } = await request.json()
    
    console.log('🎾 実際の都営システムへ接続開始...')
    console.log('対象:', { parks, timeSlots, dates })

    const availabilities = await getRealCourtStatus(parks, timeSlots, dates || [])
    
    return NextResponse.json({
      success: true,
      availabilities,
      checkedAt: new Date().toISOString(),
      method: 'real-system-connection'
    })

  } catch (error) {
    console.error('❌ 実システム接続エラー:', error)
    return NextResponse.json({ 
      error: '都営システム接続に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function getRealCourtStatus(parks: string[], timeSlots: string[], dates: string[]): Promise<CourtAvailability[]> {
  const availabilities: CourtAvailability[] = []
  
  try {
    console.log('🔐 都営システムログイン試行...')
    
    // セッション管理用のクッキーコンテナ
    const cookieJar = new Map<string, string>()
    
    // Step 1: ログインページにアクセス
    const loginPageResponse = await fetchWithCookies(LOGIN_URL, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    }, cookieJar)
    
    if (!loginPageResponse.ok) {
      throw new Error(`ログインページアクセス失敗: ${loginPageResponse.status}`)
    }
    
    const loginPageHtml = await loginPageResponse.text()
    console.log('✅ ログインページ取得成功 (', Math.round(loginPageHtml.length / 1024), 'KB)')
    
    // Step 2: ログインフォームの解析
    const formData = parseLoginForm(loginPageHtml)
    console.log('📋 ログインフォーム解析:', Object.keys(formData))
    
    // Step 3: ログイン実行
    const loginFormData = new URLSearchParams({
      ...formData,
      userId: USER_ID,
      password: PASSWORD
    })
    
    const loginResponse = await fetchWithCookies(getFullUrl(LOGIN_URL, formData.action), {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Referer': LOGIN_URL,
        'Origin': 'https://kouen.sports.metro.tokyo.lg.jp',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      body: loginFormData.toString()
    }, cookieJar)
    
    const loginResultHtml = await loginResponse.text()
    console.log('🔓 ログイン処理完了 (', Math.round(loginResultHtml.length / 1024), 'KB)')
    
    // Step 4: ログイン成功の確認
    const loginSuccess = checkLoginSuccess(loginResultHtml)
    console.log('🔍 ログイン結果:', loginSuccess ? '成功' : '失敗')
    
    if (!loginSuccess) {
      // ログイン失敗時の詳細情報を取得
      const errorInfo = extractErrorInfo(loginResultHtml)
      throw new Error(`ログイン失敗: ${errorInfo}`)
    }
    
    // Step 5: テニスコート関連ページの探索
    const tennisPageUrls = findTennisPages(loginResultHtml)
    console.log('🎾 テニス関連ページ:', tennisPageUrls.length, '件')
    
    if (tennisPageUrls.length === 0) {
      throw new Error('テニス関連ページが見つかりません')
    }
    
    // Step 6: 最初のテニスページにアクセス
    const tennisPageResponse = await fetchWithCookies(tennisPageUrls[0], {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
        'Referer': loginResponse.url,
        'Connection': 'keep-alive'
      }
    }, cookieJar)
    
    const tennisPageHtml = await tennisPageResponse.text()
    console.log('🏟️ テニスページ取得完了 (', Math.round(tennisPageHtml.length / 1024), 'KB)')
    
    // Step 7: 空き状況の解析
    const courtData = parseCourtAvailability(tennisPageHtml, parks, timeSlots, dates)
    availabilities.push(...courtData)
    
    console.log('📊 空き状況解析完了:', availabilities.length, '件')
    
  } catch (error) {
    console.error('❌ システム接続エラー:', error)
    
    // エラーが発生した場合でも基本的な情報を返す
    const currentTime = new Date().toLocaleTimeString('ja-JP')
    
    for (const park of parks) {
      for (const timeSlot of timeSlots) {
        for (const date of dates.length > 0 ? dates : [new Date().toLocaleDateString('ja-JP')]) {
          availabilities.push({
            park,
            court: `エラー: ${error instanceof Error ? error.message : '不明なエラー'}`,
            date: typeof date === 'string' ? new Date(date).toLocaleDateString('ja-JP') : date,
            time: timeSlot,
            status: 'unavailable',
            lastChecked: currentTime
          })
        }
      }
    }
  }
  
  return availabilities
}

async function fetchWithCookies(url: string, options: RequestInit, cookieJar: Map<string, string>) {
  // クッキーを追加
  const cookies = Array.from(cookieJar.entries()).map(([name, value]) => `${name}=${value}`).join('; ')
  if (cookies) {
    options.headers = {
      ...options.headers,
      'Cookie': cookies
    }
  }
  
  const response = await fetch(url, options)
  
  // レスポンスからクッキーを抽出
  const setCookieHeaders = response.headers.get('set-cookie')
  if (setCookieHeaders) {
    const cookieStrings = setCookieHeaders.split(',')
    for (const cookieString of cookieStrings) {
      const [nameValue] = cookieString.split(';')
      const [name, value] = nameValue.split('=')
      if (name && value) {
        cookieJar.set(name.trim(), value.trim())
      }
    }
  }
  
  return response
}

function parseLoginForm(html: string): Record<string, string> {
  const formData: Record<string, string> = {}
  
  // フォームのaction属性を取得
  const actionMatch = html.match(/<form[^>]*action\s*=\s*["']([^"']*)["']/i)
  if (actionMatch) {
    formData.action = actionMatch[1]
  }
  
  // 隠しフィールドを取得
  const hiddenInputs = html.matchAll(/<input[^>]*type\s*=\s*["']hidden["'][^>]*>/gi)
  for (const match of hiddenInputs) {
    const nameMatch = match[0].match(/name\s*=\s*["']([^"']*)["']/i)
    const valueMatch = match[0].match(/value\s*=\s*["']([^"']*)["']/i)
    
    if (nameMatch && valueMatch) {
      formData[nameMatch[1]] = valueMatch[1]
    }
  }
  
  return formData
}

function getFullUrl(baseUrl: string, path: string): string {
  if (path.startsWith('http')) {
    return path
  }
  const base = new URL(baseUrl)
  return new URL(path, base.origin).toString()
}

function checkLoginSuccess(html: string): boolean {
  // ログイン成功の判定ロジック
  // エラーメッセージがないか、成功を示すキーワードがあるかチェック
  const errorKeywords = ['エラー', 'error', '失敗', 'failed', 'ログインできません', 'パスワードが正しくありません']
  const successKeywords = ['メニュー', 'ホーム', '予約', 'logout', 'ログアウト']
  
  const lowerHtml = html.toLowerCase()
  
  // エラーキーワードがある場合は失敗
  for (const keyword of errorKeywords) {
    if (lowerHtml.includes(keyword.toLowerCase())) {
      return false
    }
  }
  
  // 成功キーワードがある場合は成功
  for (const keyword of successKeywords) {
    if (lowerHtml.includes(keyword.toLowerCase())) {
      return true
    }
  }
  
  // URLでも判定（ログイン後は通常URLが変わる）
  return true // 暫定的に成功とする
}

function extractErrorInfo(html: string): string {
  // エラーメッセージを抽出
  const errorPatterns = [
    /<div[^>]*class[^>]*error[^>]*>([^<]*)</i,
    /<span[^>]*class[^>]*error[^>]*>([^<]*)</i,
    /<p[^>]*class[^>]*error[^>]*>([^<]*)</i
  ]
  
  for (const pattern of errorPatterns) {
    const match = html.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  
  return 'ログイン処理でエラーが発生しました'
}

function findTennisPages(html: string): string[] {
  const tennisPages: string[] = []
  
  // テニス関連のリンクを探す
  const linkPattern = /<a[^>]*href\s*=\s*["']([^"']*)"[^>]*>([^<]*)</gi
  const matches = html.matchAll(linkPattern)
  
  for (const match of matches) {
    const href = match[1]
    const text = match[2].toLowerCase()
    
    if (text.includes('テニス') || text.includes('tennis') || text.includes('コート')) {
      const fullUrl = getFullUrl(LOGIN_URL, href)
      tennisPages.push(fullUrl)
    }
  }
  
  return tennisPages
}

function parseCourtAvailability(html: string, parks: string[], timeSlots: string[], dates: string[]): CourtAvailability[] {
  const availabilities: CourtAvailability[] = []
  const currentTime = new Date().toLocaleTimeString('ja-JP')
  const currentDate = new Date().toLocaleDateString('ja-JP')
  
  // テーブルから空き状況を解析
  const tablePattern = /<table[^>]*>([\s\S]*?)<\/table>/gi
  const tableMatches = Array.from(html.matchAll(tablePattern))
  
  let courtCount = 0
  
  for (const tableMatch of tableMatches) {
    const tableHtml = tableMatch[1]
    const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    const rowMatches = Array.from(tableHtml.matchAll(rowPattern))
    
    for (const rowMatch of rowMatches) {
      const rowHtml = rowMatch[1]
      const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
      const cells = Array.from(rowHtml.matchAll(cellPattern)).map(m => m[1].replace(/<[^>]*>/g, '').trim())
      
      if (cells.length >= 2) {
        // セルの内容から空き状況を判定
        const courtInfo = cells[0]
        const statusInfo = cells[1]
        
        const isAvailable = statusInfo.includes('○') || 
                           statusInfo.includes('空き') || 
                           statusInfo.includes('available') ||
                           statusInfo.includes('可')
        
        if (courtInfo && (courtInfo.includes('コート') || courtInfo.includes('court'))) {
          // 各公園・時間帯・日付に対してデータを生成
          for (const park of parks) {
            for (const timeSlot of timeSlots) {
              for (const date of dates.length > 0 ? dates : [currentDate]) {
                const displayDate = typeof date === 'string' ? new Date(date).toLocaleDateString('ja-JP') : date
                availabilities.push({
                  park,
                  court: courtInfo,
                  date: displayDate,
                  time: timeSlot,
                  status: isAvailable ? 'available' : 'unavailable',
                  lastChecked: currentTime
                })
                courtCount++
              }
            }
          }
        }
      }
    }
  }
  
  // テーブルが見つからない場合は基本データを返す
  if (courtCount === 0) {
    for (const park of parks) {
      for (const timeSlot of timeSlots) {
        for (const date of dates.length > 0 ? dates : [currentDate]) {
          const displayDate = typeof date === 'string' ? new Date(date).toLocaleDateString('ja-JP') : date
          availabilities.push({
            park,
            court: 'データ解析中',
            date: displayDate,
            time: timeSlot,
            status: 'unavailable',
            lastChecked: currentTime
          })
        }
      }
    }
  }
  
  return availabilities
}

export async function GET() {
  return NextResponse.json({
    message: '実際の都営システム接続API',
    status: 'active',
    loginUrl: LOGIN_URL,
    credentials: 'configured',
    lastUpdate: new Date().toISOString()
  })
}