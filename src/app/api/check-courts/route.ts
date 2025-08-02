import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'

interface CourtAvailability {
  park: string
  court: string
  date: string
  time: string
  status: 'available' | 'unavailable'
  lastChecked: string
}

interface CheckRequest {
  parks: string[]
  timeSlots: string[]
}

const LOGIN_URL = "https://kouen.sports.metro.tokyo.lg.jp/web/rsvWUserAttestationLoginAction.do"
const USER_ID = "10010139"
const PASSWORD = "20Tomato24dayo/"

export async function POST(request: NextRequest) {
  try {
    const { parks, timeSlots }: CheckRequest = await request.json()
    
    if (!parks.length || !timeSlots.length) {
      return NextResponse.json({ 
        error: '公園または時間帯が選択されていません' 
      }, { status: 400 })
    }

    const availabilities = await checkCourtAvailability(parks, timeSlots)
    
    return NextResponse.json({
      success: true,
      availabilities,
      checkedAt: new Date().toISOString()
    })

  } catch (error) {
    console.error('API エラー:', error)
    return NextResponse.json({ 
      error: 'テニスコート確認中にエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

async function checkCourtAvailability(parks: string[], timeSlots: string[]): Promise<CourtAvailability[]> {
  let browser
  const availabilities: CourtAvailability[] = []

  try {
    // Puppeteerブラウザを起動
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    })

    const page = await browser.newPage()
    
    // ユーザーエージェントを設定
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')
    
    // ログインページにアクセス
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' })
    
    // ログイン情報を入力
    await page.waitForSelector('input[name="userId"]', { timeout: 10000 })
    await page.type('input[name="userId"]', USER_ID)
    await page.type('input[name="password"]', PASSWORD)
    
    // ログインボタンをクリック
    await page.click('input[type="submit"], button[type="submit"]')
    
    // ページの読み込みを待機
    await page.waitForNavigation({ waitUntil: 'networkidle2' })
    
    // ログイン後のページを確認
    const currentUrl = page.url()
    console.log('ログイン後のURL:', currentUrl)
    
    // テニスコート予約ページに移動する処理
    // （実際のサイト構造に基づいて実装）
    await navigateToTennisReservation(page)
    
    // 各公園と時間帯の組み合わせで空き状況をチェック
    for (const park of parks) {
      for (const timeSlot of timeSlots) {
        try {
          const courtStatus = await checkSpecificCourt(page, park, timeSlot)
          availabilities.push(...courtStatus)
        } catch (error) {
          console.error(`${park} ${timeSlot} のチェック中にエラー:`, error)
          // エラーが発生した場合もデータを追加（ステータス不明として）
          availabilities.push({
            park,
            court: 'コート1',
            date: new Date().toLocaleDateString('ja-JP'),
            time: timeSlot,
            status: 'unavailable',
            lastChecked: new Date().toLocaleTimeString('ja-JP')
          })
        }
      }
    }

  } catch (error) {
    console.error('ブラウザ操作エラー:', error)
    throw error
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  return availabilities
}

async function navigateToTennisReservation(page: puppeteer.Page) {
  try {
    // テニス関連のリンクを探す
    const links = await page.$$eval('a', (anchors: HTMLAnchorElement[]) => 
      anchors
        .filter(a => a.textContent && (
          a.textContent.includes('テニス') || 
          a.textContent.includes('予約') ||
          a.textContent.includes('施設')
        ))
        .map(a => ({ text: a.textContent, href: a.href }))
    )
    
    console.log('利用可能なリンク:', links)
    
    // 最初にテニス関連のリンクがあればクリック
    if (links.length > 0) {
      await page.goto(links[0].href, { waitUntil: 'networkidle2' })
    }
    
  } catch (error) {
    console.error('テニス予約ページナビゲーションエラー:', error)
  }
}

async function checkSpecificCourt(page: puppeteer.Page, park: string, timeSlot: string): Promise<CourtAvailability[]> {
  const results: CourtAvailability[] = []
  
  try {
    // 公園選択（セレクトボックスを探して選択）
    const parkSelectors = await page.$$('select')
    
    for (const selector of parkSelectors) {
      const options = await selector.$$eval('option', (opts: HTMLOptionElement[]) =>
        opts.map(opt => ({ value: opt.value, text: opt.textContent }))
      )
      
      // 該当する公園を探す
      const matchingOption = options.find(opt => 
        opt.text && opt.text.includes(park)
      )
      
      if (matchingOption) {
        await page.select(selector, matchingOption.value)
        break
      }
    }
    
    // 時間帯選択
    const [startTime] = timeSlot.split('-')
    const timeSelectors = await page.$$('select')
    
    for (const selector of timeSelectors) {
      const options = await selector.$$eval('option', (opts: HTMLOptionElement[]) =>
        opts.map(opt => ({ value: opt.value, text: opt.textContent }))
      )
      
      const matchingTimeOption = options.find(opt => 
        opt.text && opt.text.includes(startTime)
      )
      
      if (matchingTimeOption) {
        await page.select(selector, matchingTimeOption.value)
        break
      }
    }
    
    // 検索ボタンをクリック
    const searchButtons = await page.$$('input[type="submit"], button[type="submit"]')
    if (searchButtons.length > 0) {
      await searchButtons[0].click()
      await page.waitForTimeout(2000)
    }
    
    // 結果を解析
    const courtData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table')
      const results: { court: string; available: boolean }[] = []
      
      tables.forEach(table => {
        const rows = table.querySelectorAll('tr')
        rows.forEach(row => {
          const cells = row.querySelectorAll('td')
          if (cells.length >= 3) {
            // テーブルの構造に基づいて空き状況を判定
            const courtName = cells[0]?.textContent?.trim() || 'コート'
            const status = cells[1]?.textContent?.trim() || ''
            const isAvailable = status.includes('○') || status.includes('空き') || status.includes('可')
            
            results.push({
              court: courtName,
              available: isAvailable
            })
          }
        })
      })
      
      return results
    })
    
    // 結果をフォーマット
    if (courtData.length === 0) {
      // データが取得できない場合はデフォルトのデータを返す
      results.push({
        park,
        court: 'コート1',
        date: new Date().toLocaleDateString('ja-JP'),
        time: timeSlot,
        status: 'unavailable' as const,
        lastChecked: new Date().toLocaleTimeString('ja-JP')
      })
    } else {
      courtData.forEach((court, index) => {
        results.push({
          park,
          court: court.court || `コート${index + 1}`,
          date: new Date().toLocaleDateString('ja-JP'),
          time: timeSlot,
          status: court.available ? 'available' as const : 'unavailable' as const,
          lastChecked: new Date().toLocaleTimeString('ja-JP')
        })
      })
    }
    
  } catch (error) {
    console.error(`${park} ${timeSlot} の詳細チェックエラー:`, error)
  }
  
  return results
}