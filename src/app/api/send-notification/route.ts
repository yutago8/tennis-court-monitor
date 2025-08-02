import { NextRequest, NextResponse } from 'next/server'

interface CourtAvailability {
  park: string
  court: string
  date: string
  time: string
  status: 'available' | 'unavailable'
  lastChecked: string
}

interface NotificationRequest {
  courts: CourtAvailability[]
  timestamp: string
}

// メール送信設定（環境変数で設定することを推奨）
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'yuta98tennis@gmail.com'
const FROM_EMAIL = process.env.FROM_EMAIL || 'tennis-monitor@tennis-court-monitor.vercel.app'

export async function POST(request: NextRequest) {
  try {
    const { courts, timestamp }: NotificationRequest = await request.json()
    
    if (!courts.length) {
      return NextResponse.json({ 
        error: '通知する空きコートがありません' 
      }, { status: 400 })
    }

    console.log('📧 メール通知送信開始:', courts.length, '件の空きコート')

    // メール内容を生成
    const emailContent = generateEmailContent(courts, timestamp)
    
    // メール送信（複数の方法を試す）
    const sendResult = await sendNotificationEmail(emailContent)
    
    if (sendResult.success) {
      console.log('✅ メール通知送信成功')
      return NextResponse.json({
        success: true,
        message: `${courts.length}件の空きコートについてメール通知を送信しました`,
        sentAt: new Date().toISOString()
      })
    } else {
      console.error('❌ メール送信失敗:', sendResult.error)
      return NextResponse.json({ 
        error: 'メール送信に失敗しました',
        details: sendResult.error
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ 通知API エラー:', error)
    return NextResponse.json({ 
      error: 'メール通知処理中にエラーが発生しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function generateEmailContent(courts: CourtAvailability[], timestamp: string) {
  const courtList = courts.map(court => 
    `🎾 ${court.park} ${court.court} - ${court.time} (${court.date})`
  ).join('\n')
  
  const subject = `🎉 テニスコート空き発見！${courts.length}件`
  
  const body = `
都営テニスコート監視システムからの通知

🎾 空きコートが見つかりました！

📋 発見した空きコート:
${courtList}

⏰ 発見時刻: ${new Date(timestamp).toLocaleString('ja-JP')}
🔗 予約システム: https://kouen.sports.metro.tokyo.lg.jp/web/

急いで予約サイトにアクセスして予約を取ってください！

---
都営テニスコート監視システム
${new Date().toLocaleString('ja-JP')}
  `.trim()

  return { subject, body }
}

async function sendNotificationEmail(emailContent: { subject: string; body: string }) {
  try {
    // 方法1: Vercel/Netlify Functions での簡易メール送信
    // 実際の実装では SendGrid, AWS SES, Gmail API などを使用
    
    // Gmail API を使用した送信（簡易版）
    if (process.env.GMAIL_REFRESH_TOKEN) {
      return await sendViaGmailAPI(emailContent)
    }
    
    // SendGrid を使用した送信
    if (process.env.SENDGRID_API_KEY) {
      return await sendViaSendGrid(emailContent)
    }
    
    // Webhook を使用した送信（IFTTT, Zapier など）
    if (process.env.WEBHOOK_URL) {
      return await sendViaWebhook(emailContent)
    }
    
    // 開発環境では console.log で代用
    console.log('📧 メール送信シミュレーション:')
    console.log('件名:', emailContent.subject)
    console.log('本文:')
    console.log(emailContent.body)
    console.log('宛先:', NOTIFICATION_EMAIL)
    
    return { success: true, method: 'console' }
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

async function sendViaGmailAPI(_emailContent: { subject: string; body: string }) {
  // Gmail API を使用したメール送信
  // 実装が複雑なため、現在は概要のみ
  console.log('🔄 Gmail API 送信を試行中...')
  
  // 実際の実装では OAuth2 認証とGmail API呼び出しが必要
  return { success: false, error: 'Gmail API not implemented yet' }
}

async function sendViaSendGrid(emailContent: { subject: string; body: string }) {
  try {
    console.log('🔄 SendGrid 送信を試行中...')
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: NOTIFICATION_EMAIL }]
        }],
        from: { email: FROM_EMAIL },
        subject: emailContent.subject,
        content: [{
          type: 'text/plain',
          value: emailContent.body
        }]
      })
    })
    
    if (response.ok) {
      return { success: true, method: 'sendgrid' }
    } else {
      const error = await response.text()
      return { success: false, error: `SendGrid error: ${error}` }
    }
    
  } catch (error) {
    return { 
      success: false, 
      error: `SendGrid exception: ${error instanceof Error ? error.message : 'Unknown'}` 
    }
  }
}

async function sendViaWebhook(emailContent: { subject: string; body: string }) {
  try {
    console.log('🔄 Webhook 送信を試行中...')
    
    const response = await fetch(process.env.WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: emailContent.subject,
        body: emailContent.body,
        to: NOTIFICATION_EMAIL,
        timestamp: new Date().toISOString()
      })
    })
    
    if (response.ok) {
      return { success: true, method: 'webhook' }
    } else {
      return { success: false, error: `Webhook error: ${response.status}` }
    }
    
  } catch (error) {
    return { 
      success: false, 
      error: `Webhook exception: ${error instanceof Error ? error.message : 'Unknown'}` 
    }
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'テニスコート空き通知API',
    status: 'active',
    supportedMethods: [
      'Gmail API (要設定)',
      'SendGrid (要API KEY)',
      'Webhook (要URL設定)',
      'Console Log (開発用)'
    ],
    lastUpdate: new Date().toISOString()
  })
}