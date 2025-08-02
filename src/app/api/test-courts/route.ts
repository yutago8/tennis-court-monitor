import { NextRequest, NextResponse } from 'next/server'

interface CourtAvailability {
  park: string
  court: string
  date: string
  time: string
  status: 'available' | 'unavailable'
  lastChecked: string
}

export async function POST(request: NextRequest) {
  try {
    const { parks, timeSlots } = await request.json()
    
    // テスト用のモックデータを生成
    const availabilities: CourtAvailability[] = []
    const currentDate = new Date().toLocaleDateString('ja-JP')
    const currentTime = new Date().toLocaleTimeString('ja-JP')
    
    parks.forEach((park: string) => {
      timeSlots.forEach((timeSlot: string) => {
        // ランダムに複数のコートを生成
        const courtCount = Math.floor(Math.random() * 3) + 1
        
        for (let i = 1; i <= courtCount; i++) {
          const isAvailable = Math.random() > 0.7 // 30%の確率で空き
          
          availabilities.push({
            park,
            court: `コート${i}`,
            date: currentDate,
            time: timeSlot,
            status: isAvailable ? 'available' : 'unavailable',
            lastChecked: currentTime
          })
        }
      })
    })
    
    // 少し遅延を加えてリアルな感じにする
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000))
    
    return NextResponse.json({
      success: true,
      availabilities,
      checkedAt: new Date().toISOString()
    })

  } catch (error) {
    console.error('テストAPI エラー:', error)
    return NextResponse.json({ 
      error: 'テストAPI エラー' 
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'テニスコート監視システム テストAPI',
    endpoints: {
      'POST /api/test-courts': 'テスト用のコート空き状況取得'
    }
  })
}