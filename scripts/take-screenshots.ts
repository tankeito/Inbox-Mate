import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const artifactDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\25838ae5-7eb4-42d8-9381-91cfdc3444d9';

  // Desktop context
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000/backyard...');
  await page.goto('http://localhost:3000/backyard', { waitUntil: 'networkidle', timeout: 15000 });

  // Login
  const emailInput = page.locator('input[type="email"], input[placeholder*="邮箱"]').first();
  if (await emailInput.isVisible()) {
    console.log('Logging in as admin...');
    await emailInput.fill('tqd354@gmail.com');
    await page.locator('input[type="password"]').first().fill('aaAA1122');
    await page.locator('button[type="submit"], button:has-text("登录")').first().click();
    await page.waitForTimeout(2000);
  }

  // 1. Dashboard
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, 'screenshot_dashboard_desktop.png'), fullPage: false });
  console.log('Dashboard desktop screenshot taken');

  // 2. RPA Status
  const rpaNav = page.locator('button:has-text("Chrome RPA 运维")').first();
  if (await rpaNav.isVisible()) {
    await rpaNav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_rpa_desktop.png'), fullPage: false });
    console.log('RPA desktop screenshot taken');
  }

  // 3. Tokens
  const tokensNav = page.locator('button:has-text("授权 Token 生成器")').first();
  if (await tokensNav.isVisible()) {
    await tokensNav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_tokens_desktop.png'), fullPage: false });
    console.log('Tokens desktop screenshot taken');
  }

  // 4. IP Analytics
  const ipNav = page.locator('button:has-text("IP 统计与安全防御")').first();
  if (await ipNav.isVisible()) {
    await ipNav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_ip_analytics_desktop.png'), fullPage: false });
    console.log('IP Analytics desktop screenshot taken');
  }

  // 5. Settings
  const settingsNav = page.locator('button:has-text("安全与 2FA 设置")').first();
  if (await settingsNav.isVisible()) {
    await settingsNav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, 'screenshot_settings_desktop.png'), fullPage: false });
    console.log('Settings desktop screenshot taken');
  }

  // Mobile Context
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:3000/backyard', { waitUntil: 'networkidle', timeout: 15000 });
  const mEmailInput = mobilePage.locator('input[type="email"], input[placeholder*="邮箱"]').first();
  if (await mEmailInput.isVisible()) {
    await mEmailInput.fill('tqd354@gmail.com');
    await mobilePage.locator('input[type="password"]').first().fill('aaAA1122');
    await mobilePage.locator('button[type="submit"], button:has-text("登录")').first().click();
    await mobilePage.waitForTimeout(2000);
  }
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: path.join(artifactDir, 'screenshot_dashboard_mobile.png'), fullPage: false });
  console.log('Dashboard mobile screenshot taken');

  await browser.close();
  console.log('All screenshots completed successfully!');
}

main().catch((err) => {
  console.error('Screenshot script error:', err);
  process.exit(1);
});
