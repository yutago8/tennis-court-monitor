#!/usr/bin/env node

/**
 * 都営テニスコート予約システムの詳細構造調査スクリプト
 * 実際のログイン〜テニスコート選択〜空き状況確認までの全フローを解析
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// 設定
const CONFIG = {
  LOGIN_URL: "https://kouen.sports.metro.tokyo.lg.jp/web/rsvWUserAttestationLoginAction.do",
  USER_ID: "10010139",
  PASSWORD: "20Tomato24dayo/",
  OUTPUT_DIR: "analysis-results",
  HEADLESS: false, // 実際の画面を確認するためfalseに設定
  TIMEOUT: 30000
};

async function ensureOutputDir() {
  try {
    await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });
  } catch (error) {
    console.error('出力ディレクトリ作成エラー:', error);
  }
}

async function savePageInfo(page, filename, description) {
  try {
    const url = page.url();
    const title = await page.title();
    const html = await page.content();
    const screenshot = await page.screenshot({ fullPage: true });
    
    const info = {
      timestamp: new Date().toISOString(),
      description,
      url,
      title,
      html: html.substring(0, 10000) // HTMLの先頭10000文字のみ保存
    };
    
    // JSON情報を保存
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, `${filename}.json`),
      JSON.stringify(info, null, 2)
    );
    
    // フルHTMLを保存
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, `${filename}.html`),
      html
    );
    
    // スクリーンショットを保存
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, `${filename}.png`),
      screenshot
    );
    
    console.log(`✅ ${description} - 情報保存完了: ${filename}`);
    
  } catch (error) {
    console.error(`❌ ${description} - 保存エラー:`, error);
  }
}

async function analyzeFormElements(page, pageName) {
  try {
    const formAnalysis = await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      const selects = Array.from(document.querySelectorAll('select'));
      const inputs = Array.from(document.querySelectorAll('input'));
      const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      
      return {
        forms: forms.map(form => ({
          id: form.id,
          name: form.name,
          action: form.action,
          method: form.method,
          elements: form.elements.length
        })),
        selects: selects.map(select => ({
          id: select.id,
          name: select.name,
          options: Array.from(select.options).map(opt => ({
            value: opt.value,
            text: opt.textContent.trim()
          }))
        })),
        inputs: inputs.map(input => ({
          id: input.id,
          name: input.name,
          type: input.type,
          value: input.value,
          placeholder: input.placeholder
        })),
        buttons: buttons.map(button => ({
          id: button.id,
          name: button.name,
          type: button.type,
          text: button.textContent ? button.textContent.trim() : button.value,
          onclick: button.onclick ? button.onclick.toString() : null
        }))
      };
    });
    
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, `${pageName}-form-analysis.json`),
      JSON.stringify(formAnalysis, null, 2)
    );
    
    console.log(`📋 ${pageName} - フォーム要素解析完了`);
    return formAnalysis;
    
  } catch (error) {
    console.error(`❌ ${pageName} - フォーム解析エラー:`, error);
    return null;
  }
}

async function performLogin(page) {
  try {
    console.log('🔐 ログイン処理開始...');
    
    // ログインページにアクセス
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'networkidle2' });
    await savePageInfo(page, '01-login-page', 'ログインページ');
    await analyzeFormElements(page, '01-login');
    
    // ログインフォームを探す
    await page.waitForSelector('input[name="userId"], input[id="userId"]', { timeout: CONFIG.TIMEOUT });
    
    // ユーザーIDを入力
    const userIdInput = await page.$('input[name="userId"], input[id="userId"]');
    if (userIdInput) {
      await userIdInput.clear();
      await userIdInput.type(CONFIG.USER_ID);
      console.log(`✅ ユーザーID入力完了: ${CONFIG.USER_ID}`);
    }
    
    // パスワードを入力
    const passwordInput = await page.$('input[name="password"], input[id="password"], input[type="password"]');
    if (passwordInput) {
      await passwordInput.clear();
      await passwordInput.type(CONFIG.PASSWORD);
      console.log('✅ パスワード入力完了');
    }
    
    // ログインボタンをクリック
    const loginButton = await page.$('input[type="submit"], button[type="submit"], button');
    if (loginButton) {
      await loginButton.click();
      console.log('✅ ログインボタンクリック');
    }
    
    // ページ遷移を待機
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
    
    console.log('🎉 ログイン完了');
    return true;
    
  } catch (error) {
    console.error('❌ ログインエラー:', error);
    return false;
  }
}

async function explorePostLoginPages(page) {
  try {
    console.log('🏠 ログイン後のページ探索開始...');
    
    // ログイン後のホームページ
    await savePageInfo(page, '02-home-page', 'ログイン後ホームページ');
    await analyzeFormElements(page, '02-home');
    
    // テニス関連のリンクを探す
    const tennisLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      return links
        .filter(link => {
          const text = link.textContent.toLowerCase();
          return text.includes('テニス') || 
                 text.includes('tennis') ||
                 text.includes('予約') ||
                 text.includes('空き') ||
                 text.includes('検索');
        })
        .map(link => ({
          href: link.href,
          text: link.textContent.trim(),
          id: link.id,
          className: link.className
        }));
    });
    
    console.log('🎾 テニス関連リンク発見:', tennisLinks.length, '件');
    
    // テニス関連リンクの情報を保存
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, 'tennis-links.json'),
      JSON.stringify(tennisLinks, null, 2)
    );
    
    // 最初のテニス関連リンクをクリック
    if (tennisLinks.length > 0) {
      console.log(`📍 "${tennisLinks[0].text}" をクリックします...`);
      await page.goto(tennisLinks[0].href, { waitUntil: 'networkidle2' });
      
      await savePageInfo(page, '03-tennis-page', 'テニス関連ページ');
      await analyzeFormElements(page, '03-tennis');
    }
    
    return tennisLinks;
    
  } catch (error) {
    console.error('❌ ページ探索エラー:', error);
    return [];
  }
}

async function analyzeTennisCourtSelection(page) {
  try {
    console.log('🏟️ テニスコート選択画面の解析開始...');
    
    // 現在のページでセレクトボックスを探す
    const selectBoxes = await page.$$('select');
    console.log(`📋 セレクトボックス発見: ${selectBoxes.length} 個`);
    
    const selectionOptions = {};
    
    for (let i = 0; i < selectBoxes.length; i++) {
      const select = selectBoxes[i];
      const selectInfo = await select.evaluate((el, index) => ({
        index,
        id: el.id,
        name: el.name,
        className: el.className,
        options: Array.from(el.options).map(opt => ({
          value: opt.value,
          text: opt.textContent.trim(),
          selected: opt.selected
        }))
      }), i);
      
      selectionOptions[`select_${i}`] = selectInfo;
      console.log(`📝 セレクト${i}: ${selectInfo.name || selectInfo.id || 'unnamed'} (${selectInfo.options.length} オプション)`);
    }
    
    // 選択オプションを保存
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, 'court-selection-options.json'),
      JSON.stringify(selectionOptions, null, 2)
    );
    
    return selectionOptions;
    
  } catch (error) {
    console.error('❌ テニスコート選択解析エラー:', error);
    return {};
  }
}

async function findAvailabilityTable(page) {
  try {
    console.log('📊 空き状況テーブルの探索開始...');
    
    // テーブルを探す
    const tables = await page.$$('table');
    console.log(`📋 テーブル発見: ${tables.length} 個`);
    
    const tableAnalysis = [];
    
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const tableInfo = await table.evaluate((el, index) => {
        const rows = Array.from(el.querySelectorAll('tr'));
        return {
          index,
          id: el.id,
          className: el.className,
          rowCount: rows.length,
          structure: rows.slice(0, 5).map(row => { // 最初の5行のみ
            const cells = Array.from(row.querySelectorAll('td, th'));
            return cells.map(cell => ({
              tag: cell.tagName,
              text: cell.textContent.trim().substring(0, 50), // 最初の50文字
              className: cell.className
            }));
          })
        };
      }, i);
      
      tableAnalysis.push(tableInfo);
      console.log(`📊 テーブル${i}: ${tableInfo.rowCount} 行`);
    }
    
    // テーブル解析結果を保存
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, 'table-analysis.json'),
      JSON.stringify(tableAnalysis, null, 2)
    );
    
    return tableAnalysis;
    
  } catch (error) {
    console.error('❌ テーブル解析エラー:', error);
    return [];
  }
}

async function main() {
  let browser;
  
  try {
    console.log('🚀 都営テニスコートシステム解析開始...');
    
    // 出力ディレクトリを作成
    await ensureOutputDir();
    
    // ブラウザを起動
    browser = await puppeteer.launch({
      headless: CONFIG.HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1280, height: 1024 }
    });
    
    const page = await browser.newPage();
    
    // ユーザーエージェントを設定
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // 1. ログイン処理
    const loginSuccess = await performLogin(page);
    if (!loginSuccess) {
      throw new Error('ログインに失敗しました');
    }
    
    // 2. ログイン後のページ探索
    const tennisLinks = await explorePostLoginPages(page);
    
    // 3. テニスコート選択画面の解析
    const selectionOptions = await analyzeTennisCourtSelection(page);
    
    // 4. 空き状況テーブルの解析
    const tableAnalysis = await findAvailabilityTable(page);
    
    // 5. 最終レポート作成
    const report = {
      timestamp: new Date().toISOString(),
      analysis: {
        loginSuccess,
        tennisLinksFound: tennisLinks.length,
        selectionOptionsFound: Object.keys(selectionOptions).length,
        tablesFound: tableAnalysis.length
      },
      summary: {
        tennisLinks: tennisLinks.slice(0, 5), // 最初の5つ
        selectionOptions,
        tableAnalysis
      }
    };
    
    await fs.writeFile(
      path.join(CONFIG.OUTPUT_DIR, 'final-report.json'),
      JSON.stringify(report, null, 2)
    );
    
    console.log('');
    console.log('🎉 解析完了！');
    console.log(`📂 結果は ${CONFIG.OUTPUT_DIR} フォルダに保存されました`);
    console.log('');
    console.log('📋 解析結果サマリー:');
    console.log(`   - ログイン: ${loginSuccess ? '成功' : '失敗'}`);
    console.log(`   - テニス関連リンク: ${tennisLinks.length} 件`);
    console.log(`   - 選択オプション: ${Object.keys(selectionOptions).length} 個`);
    console.log(`   - テーブル: ${tableAnalysis.length} 個`);
    
    // 30秒待機して画面を確認できるようにする
    if (!CONFIG.HEADLESS) {
      console.log('');
      console.log('🔍 30秒間画面を表示します。ブラウザで詳細を確認してください...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
  } catch (error) {
    console.error('❌ 解析中にエラーが発生しました:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };