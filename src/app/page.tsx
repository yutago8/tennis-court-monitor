'use client'

import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, Settings, Bell, Clock, MapPin } from 'lucide-react'

interface CourtAvailability {
  park: string
  court: string
  date: string
  time: string
  status: 'available' | 'unavailable'
  lastChecked: string
}

interface MonitorSettings {
  parks: string[]
  timeSlots: string[]
  selectedDates: string[]
  interval: number
  isActive: boolean
}

export default function TennisMonitor() {
  const [settings, setSettings] = useState<MonitorSettings>({
    parks: [],
    timeSlots: [],
    selectedDates: [],
    interval: 5,
    isActive: false
  })

  const [availabilities, setAvailabilities] = useState<CourtAvailability[]>([])
  const [notifications, setNotifications] = useState<string[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [lastError, setLastError] = useState<string>('')
  const [isChecking, setIsChecking] = useState(false)

  // 都営テニスコートの全公園リスト
  const parkOptions = [
    '有明テニスの森公園',
    '駒沢オリンピック公園',
    '大井ふ頭中央海浜公園',
    '篠崎公園',
    '大島小松川公園',
    '石神井公園',
    '井の頭恩賜公園',
    '浮間公園',
    '木場公園',
    '舎人公園',
    '城北中央公園',
    '水元公園',
    '善福寺川緑地',
    '代々木公園',
    '武蔵野中央公園',
    '武蔵野の森公園',
    '夢の島公園',
    '林試の森公園',
    '砧公園',
    '葛西臨海公園'
  ]

  const timeSlotOptions = [
    '09:00-11:00',
    '11:00-13:00',
    '13:00-15:00',
    '15:00-17:00',
    '17:00-19:00',
    '19:00-21:00'
  ]

  // 日付選択用のオプションを生成（今日から30日後まで）
  const generateDateOptions = () => {
    const dates = []
    const today = new Date()
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      
      const dateString = date.toISOString().split('T')[0] // YYYY-MM-DD format
      const displayString = date.toLocaleDateString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        weekday: 'short'
      })
      
      dates.push({
        value: dateString,
        display: `${date.getMonth() + 1}/${date.getDate()}(${displayString.split('(')[1]}`
      })
    }
    
    return dates
  }

  const dateOptions = generateDateOptions()

  const toggleMonitoring = () => {
    setSettings(prev => ({ ...prev, isActive: !prev.isActive }))
  }

  const sendEmailNotification = async (availableCourts: CourtAvailability[]) => {
    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courts: availableCourts,
          timestamp: new Date().toISOString()
        })
      })

      if (response.ok) {
        console.log('✅ メール通知送信完了')
      } else {
        console.error('❌ メール通知送信失敗')
      }
    } catch (error) {
      console.error('❌ メール通知エラー:', error)
    }
  }

  const checkAvailability = useCallback(async () => {
    if (!settings.isActive || settings.parks.length === 0) return

    setIsChecking(true)
    setLastError('')

    try {
      console.log('🔄 APIリクエスト送信中...', {
        parks: settings.parks.length,
        timeSlots: settings.timeSlots.length,
        dates: settings.selectedDates.length
      })

      const response = await fetch('/api/real-court-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parks: settings.parks,
          timeSlots: settings.timeSlots,
          dates: settings.selectedDates
        })
      })

      console.log('📡 APIレスポンス受信:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ APIデータ取得成功:', {
          availabilities: data.availabilities?.length || 0,
          success: data.success
        })
        setAvailabilities(data.availabilities)
        
        // 新しい空きがあった場合の通知
        const newAvailable = data.availabilities.filter((av: CourtAvailability) => 
          av.status === 'available'
        )
        
        if (newAvailable.length > 0) {
          const newNotification = `${new Date().toLocaleTimeString()}: 🎉 ${newAvailable.length}件の空きを発見！`
          setNotifications(prev => [newNotification, ...prev.slice(0, 9)])
          
          // メール通知を送信
          sendEmailNotification(newAvailable)
        }
      } else {
        // エラーレスポンスの詳細を取得
        let errorText = ''
        try {
          const errorData = await response.json()
          errorText = errorData.error || errorData.details || 'APIエラー'
          console.error('❌ APIエラーレスポンス:', errorData)
        } catch {
          errorText = await response.text()
          console.error('❌ APIエラーテキスト:', errorText)
        }
        
        throw new Error(`API Error (${response.status}): ${errorText}`)
      }
    } catch (error) {
      console.error('空き状況チェックエラー:', error)
      let errorMessage = '不明なエラー'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      // より詳細なエラー情報をログ出力
      console.error('詳細エラー情報:', {
        error,
        type: typeof error,
        message: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack trace'
      })
      
      setLastError(`${errorMessage} (${new Date().toLocaleTimeString()})`)
      setNotifications(prev => [`${new Date().toLocaleTimeString()}: ❌ エラー: ${errorMessage}`, ...prev.slice(0, 9)])
    } finally {
      setIsChecking(false)
    }
  }, [settings.isActive, settings.parks, settings.timeSlots, settings.selectedDates])

  useEffect(() => {
    let interval: NodeJS.Timeout
    
    if (settings.isActive) {
      checkAvailability() // 即座に実行
      interval = setInterval(checkAvailability, settings.interval * 60 * 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [settings.isActive, settings.interval, checkAvailability])

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <header className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">都営テニスコート監視システム</h1>
              <p className="text-gray-600 mt-2">5分間隔でテニスコートの空き状況を監視します</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Settings className="w-4 h-4" />
                設定
              </button>
              <button
                onClick={toggleMonitoring}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium ${
                  settings.isActive
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {settings.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {settings.isActive ? '監視停止' : '監視開始'}
              </button>
            </div>
          </div>
        </header>

        {showSettings && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">監視設定</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  監視対象公園
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  <label className="flex items-center mb-2 bg-blue-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={settings.parks.length === parkOptions.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSettings(prev => ({ ...prev, parks: [...parkOptions] }))
                        } else {
                          setSettings(prev => ({ ...prev, parks: [] }))
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-blue-700">全て選択 ({parkOptions.length}公園)</span>
                  </label>
                  {parkOptions.map(park => (
                    <label key={park} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.parks.includes(park)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSettings(prev => ({ ...prev, parks: [...prev.parks, park] }))
                          } else {
                            setSettings(prev => ({ 
                              ...prev, 
                              parks: prev.parks.filter(p => p !== park) 
                            }))
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-xs">{park}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  監視時間帯
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  <label className="flex items-center mb-2 bg-green-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={settings.timeSlots.length === timeSlotOptions.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSettings(prev => ({ ...prev, timeSlots: [...timeSlotOptions] }))
                        } else {
                          setSettings(prev => ({ ...prev, timeSlots: [] }))
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-green-700">全時間帯</span>
                  </label>
                  {timeSlotOptions.map(timeSlot => (
                    <label key={timeSlot} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.timeSlots.includes(timeSlot)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSettings(prev => ({ ...prev, timeSlots: [...prev.timeSlots, timeSlot] }))
                          } else {
                            setSettings(prev => ({ 
                              ...prev, 
                              timeSlots: prev.timeSlots.filter(t => t !== timeSlot) 
                            }))
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{timeSlot}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  監視対象日付
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  <label className="flex items-center mb-2 bg-orange-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={settings.selectedDates.length === dateOptions.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSettings(prev => ({ ...prev, selectedDates: dateOptions.map(d => d.value) }))
                        } else {
                          setSettings(prev => ({ ...prev, selectedDates: [] }))
                        }
                      }}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-orange-700">30日間全て</span>
                  </label>
                  {dateOptions.map(date => (
                    <label key={date.value} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.selectedDates.includes(date.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSettings(prev => ({ ...prev, selectedDates: [...prev.selectedDates, date.value] }))
                          } else {
                            setSettings(prev => ({ 
                              ...prev, 
                              selectedDates: prev.selectedDates.filter(d => d !== date.value) 
                            }))
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-xs">{date.display}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                チェック間隔（分）
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={settings.interval}
                onChange={(e) => setSettings(prev => ({ ...prev, interval: parseInt(e.target.value) }))}
                className="w-32 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 通知パネル */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold">通知履歴</h2>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-gray-500 text-sm">まだ通知はありません</p>
              ) : (
                notifications.map((notification, index) => (
                  <div key={index} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">{notification}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 監視状況 */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-semibold">監視状況</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">状態:</span>
                <span className={`text-sm font-medium ${
                  settings.isActive 
                    ? isChecking 
                      ? 'text-blue-600' 
                      : 'text-green-600' 
                    : 'text-gray-400'
                }`}>
                  {settings.isActive 
                    ? isChecking 
                      ? '接続中...' 
                      : '監視中' 
                    : '停止中'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">対象公園:</span>
                <span className="text-sm">{settings.parks.length}件</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">時間帯:</span>
                <span className="text-sm">{settings.timeSlots.length}件</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">対象日付:</span>
                <span className="text-sm">{settings.selectedDates.length}日</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">チェック間隔:</span>
                <span className="text-sm">{settings.interval}分</span>
              </div>
              {lastError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">
                    <span className="font-medium">最新エラー:</span><br />
                    {lastError}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 空き状況表示 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-orange-600" />
            <h2 className="text-xl font-semibold">空き状況</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">公園</th>
                  <th className="text-left py-2">コート</th>
                  <th className="text-left py-2">日付</th>
                  <th className="text-left py-2">時間</th>
                  <th className="text-left py-2">状況</th>
                  <th className="text-left py-2">最終確認</th>
                </tr>
              </thead>
              <tbody>
                {availabilities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-gray-500">
                      監視を開始すると結果が表示されます
                    </td>
                  </tr>
                ) : (
                  availabilities.map((availability, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2 text-sm">{availability.park}</td>
                      <td className="py-2 text-sm">{availability.court}</td>
                      <td className="py-2 text-sm">{availability.date}</td>
                      <td className="py-2 text-sm">{availability.time}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          availability.status === 'available'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {availability.status === 'available' ? '空き' : '満室'}
                        </span>
                      </td>
                      <td className="py-2 text-sm text-gray-500">{availability.lastChecked}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
