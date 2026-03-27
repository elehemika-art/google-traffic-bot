const webDriver = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const chromedriver = new chrome.ServiceBuilder(require('chromedriver').path)

const auto = require('./autobot')
const loadproxy = require('./proxy')
const spoofing = require('./spoofing')

const PERMISSIONS = [
    "--mute-audio",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    // Fix slow background tabs
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=IsolateOrigins,site-per-process",
    // Look more human
    "--disable-web-security",
    "--allow-running-insecure-content",
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--use-mock-keychain",
]

const MAX_CONCURRENT = 5

const USER_AGENTS = [
    // Mac Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    // Windows Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    // Windows Edge (blends in well)
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    // Linux Chrome
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
]

function randomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function delay(time){
    return new Promise(resolve => setTimeout(resolve, time))
}

function randomDelay(min, max){
    return delay(Math.floor(Math.random() * (max - min + 1)) + min)
}

function Stealth(driver){
    return new Promise(async function(resolve){
        try {
            var connection = await driver.createCDPConnection('page')
            await connection.execute('Runtime.enable', {}, null)
            await connection.execute('Page.enable', {}, null)
            await connection.execute("Page.addScriptToEvaluateOnNewDocument", {
                source: spoofing()
            }, null)
        } catch(e) {
            // Silent
        }
        resolve(true)
    })
}

// Searches ALL anchor tags on the current page for an href matching `url`.
// Returns the matching anchor element, or null if not found.
async function findSiteUrl(Driver, url) {
    try {
        const anchors = await Driver.findElements(webDriver.By.css('#search a[href], #rso a[href]'))
        for (let anchor of anchors) {
            try {
                const href = await anchor.getAttribute('href')
                if (href && href.includes && href.match(url)) {
                    const displayed = await anchor.isDisplayed().catch(() => true)
                    if (displayed) {
                        console.log(`[FIND]: found site at ${href}`)
                        return anchor
                    }
                }
            } catch(e) {}
        }
    } catch(e) {
        console.log('[FIND]: error scanning anchors', e.message)
    }
    return null
}

async function nextPage(Driver, url, pageCount = 0) {
    if (pageCount >= 25) {
        console.log('[SEARCH]: site not found in 25 pages, stopping')
        return null
    }
    // Try clicking Next button first
    try {
        var nextBtn = await Driver.findElement(webDriver.By.id('pnnext'))
        await nextBtn.click()
    } catch(e) {
        // Modern Google: scroll to bottom then click 'More results'
        await Driver.executeScript('window.scrollTo(0, document.body.scrollHeight);')
        await randomDelay(1000, 2000)
        try {
            var moreBtns = await Driver.findElements(webDriver.By.xpath("//*[contains(text(),'More results') or contains(text(),'Más resultados') or contains(text(),'Weitere Ergebnisse')]"))
            if (moreBtns.length > 0) await Driver.executeScript('arguments[0].click();', moreBtns[0])
        } catch(err) {}
    }
    await randomDelay(1500, 2500)
    var found = await findSiteUrl(Driver, url)
    if (!found) return nextPage(Driver, url, pageCount + 1)
    return found
}

async function clickSiteElement(Driver, element) {
    try {
        await Driver.executeScript('arguments[0].scrollIntoView({behavior: "smooth", block: "center"});', element)
        await randomDelay(800, 1500)
        // Try JS click first (most reliable, bypasses overlay issues)
        await Driver.executeScript('arguments[0].click();', element)
        await randomDelay(800, 1500)
        await Driver.executeScript(auto.scroll())
        console.log('[CLICK]: successfully clicked result')
        return true
    } catch(e) {
        console.log('[CLICK]: error clicking element', e.message)
        return false
    }
}

const WINDOW_SIZES = [
    [1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080], [1280, 800], [1280, 720]
]

async function buildDriver(proxy, headless){
    var options = new chrome.Options()
    if (proxy) {
        const proxyStr = proxy.includes('://') ? proxy : `http://${proxy}`;
        options.addArguments(`--proxy-server=${proxyStr}`);
    }
    if (headless)
        options.addArguments('--headless=new')
    // Random window size so every tab doesn't look identical
    const wsize = WINDOW_SIZES[Math.floor(Math.random() * WINDOW_SIZES.length)]
    options.addArguments(`--window-size=${wsize[0]},${wsize[1]}`)
    PERMISSIONS.forEach(perms => options.addArguments(perms))
    options.excludeSwitches('enable-automation')
    options.excludeSwitches('enable-logging')
    options.setUserPreferences({
        'credentials_enable_service': false,
        'profile.password_manager_enabled': false
    })
    options.addArguments(`--user-agent=${randomUA()}`)
    // Randomize accept-language slightly so headers match diverse real users
    const langs = ['en-US,en;q=0.9', 'en-US,en;q=0.9,fr;q=0.8', 'en-GB,en;q=0.9', 'en-US,en;q=0.8']
    options.addArguments(`--lang=${langs[Math.floor(Math.random() * langs.length)]}`)
    return await new webDriver.Builder()
        .forBrowser('chrome')
        .setChromeService(chromedriver)
        .setChromeOptions(options)
        .build()
}

async function bypassConsent(driver, proxy){
    try {
        await driver.get("https://www.google.com/")
    } catch(e) {
        console.log(`[GOOGLE]: Initial load failed with proxy ${proxy || 'DIRECT'}, retrying...`, e.message)
        await delay(2000)
        await driver.get("https://www.google.com/")
    }
    
    await randomDelay(2000, 4000) // Give more time for proxies
    try {
        var buttons = await driver.findElements(webDriver.By.css('button'))
        for (var b of buttons){
            var text = await b.getText()
            if (text.includes('Accept') || text.includes('I agree') || text.includes('Agree') || text.includes('Accetto') || text.includes('Acepto') || text.includes('Ich stimme zu') || text.includes('Confirm') || text.includes('Allow all')){
                await b.click()
                await randomDelay(500, 1500)
                break
            }
        }
    } catch(e) {}
}

async function typeSlowly(element, text){
    for (var char of text){
        await element.sendKeys(char)
        await delay(Math.floor(Math.random() * 100) + 50)
    }
}

// --- State ---
const { BrowserWindow } = require('electron');
let driverList = []
let isRunning = false
let activeCount = 0
let totalCompleted = 0
let totalFailed = 0;
process.setMaxListeners(20); // Fix MaxListenersExceeded
let launcherInterval = null
let launchQueue = []

function broadcastStats() {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length > 0) {
        wins[0].webContents.send('stats-update', { 
            active: activeCount, 
            completed: totalCompleted, 
            failed: totalFailed,
            remaining: launchQueue.length
        });
    }
}

async function organicDwell(driver, originalUrl) {
    await driver.executeScript(auto.scroll());
    // Randomized Dwell Times between 45s and 75s
    let totalDwell = Math.floor(Math.random() * (75000 - 45000 + 1)) + 45000;
    
    let dwell1 = totalDwell / 2;
    let dwell2 = totalDwell - dwell1;

    async function doDwell(time) {
        let elapsed = 0;
        while (elapsed < time) {
            try {
                // Jiggle Mouse organically
                await driver.executeScript(`
                    var x = Math.floor(Math.random() * window.innerWidth);
                    var y = Math.floor(Math.random() * window.innerHeight);
                    var evt = new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true });
                    document.dispatchEvent(evt);
                `);
            } catch(e) {}
            let waitTime = Math.floor(Math.random() * (4000 - 1000 + 1)) + 1000;
            if (elapsed + waitTime > time) waitTime = time - elapsed;
            await delay(waitTime);
            elapsed += waitTime;
        }
    }

    await doDwell(dwell1);

    // Internal Page Browsing (HUGE for SEO)
    try {
        let currentUrlObj = null;
        try { currentUrlObj = new URL(originalUrl); } catch(e) {}
        
        if (currentUrlObj) {
            let baseDomain = currentUrlObj.hostname.replace('www.', '');
            const links = await driver.findElements(webDriver.By.css('a'));
            let validLinks = [];
            for (let i = 0; i < Math.min(links.length, 50); i++) {
                try {
                    let href = await links[i].getAttribute('href');
                    if (href && href.includes(baseDomain) && !href.includes('#') && !href.match(/\.(jpg|png|gif|pdf)$/i)) {
                        let displayed = await links[i].isDisplayed();
                        if (displayed) validLinks.push(links[i]);
                    }
                } catch(e) {}
            }
            if (validLinks.length > 0) {
                const randomLink = validLinks[Math.floor(Math.random() * validLinks.length)];
                await driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", randomLink);
                await delay(1500);
                await driver.executeScript("arguments[0].click();", randomLink);
                await delay(3000);
                await driver.executeScript(auto.scroll()); // Start scrolling on new page
            }
        }
    } catch(e) {}

    await doDwell(dwell2);
}

async function Direct(url, headless, proxy, minimizeOption){
    let driver = null
    console.log(`[DIRECT]: Task started using proxy: ${proxy || 'DIRECT'}`)
    try {
        driver = await buildDriver(proxy, headless)
        driverList.push({ driver: driver, time: Date.now() })
        if (minimizeOption) { try { await driver.manage().window().minimize() } catch(e) {} }
        await Stealth(driver)
        await driver.get(url)
        await randomDelay(800, 1500)
        await organicDwell(driver, url) // Smart browsing
    } catch(e) {
        console.log('[DIRECT ERROR]:', e.message)
        throw e;
    } finally {
        if (driver) {
            try { await driver.quit() } catch(_) {}
            driverList = driverList.filter(d => d.driver !== driver)
        }
    }
}

async function googleSearch(url, keyboard, headless, proxy, minimizeOption){
    var driver = null
    console.log(`[GOOGLE]: Task started using proxy: ${proxy || 'DIRECT'}`)
    try {
        driver = await buildDriver(proxy, headless)
        driverList.push({ driver: driver, time: Date.now() })
        if (minimizeOption) { try { await driver.manage().window().minimize() } catch(e) {} }
        await Stealth(driver)
        await bypassConsent(driver, proxy)
        await driver.wait(
            webDriver.until.elementLocated(webDriver.By.css('textarea[name="q"], input[name="q"], [name="q"], [aria-label="Search"]')),
            20000 
        )
        var searchBox = await driver.findElement(webDriver.By.css('textarea[name="q"], input[name="q"], [name="q"], [aria-label="Search"]'))
        await typeSlowly(searchBox, keyboard)
        await randomDelay(300, 600)
        await searchBox.sendKeys(webDriver.Key.RETURN)
        await randomDelay(1500, 2500)
        var siteElement = await findSiteUrl(driver, url)
        await randomDelay(800, 1500)
        if (!siteElement)
            siteElement = await nextPage(driver, url, 0)
        await randomDelay(500, 1000)
        if (siteElement) await clickSiteElement(driver, siteElement)
        await organicDwell(driver, url) // Smart browsing
    } catch(e) {
        console.log('[GOOGLE]: error during search', e.message)
        throw e;
    } finally {
        if (driver){
            try { await driver.quit() } catch(_) {}
            driverList = driverList.filter(d => d.driver !== driver)
        }
    }
}

async function proxyServer(url, keyboard, headless, proxy, minimizeOption){
    var driver = null
    console.log(`[PROXY]: Task started using proxy: ${proxy || 'DIRECT'}`)
    try {
        driver = await buildDriver(proxy, headless)
        driverList.push({ driver: driver, time: Date.now() })
        if (minimizeOption) { try { await driver.manage().window().minimize() } catch(e) {} }
        await Stealth(driver)
        await driver.get('https://www.blockaway.net')
        await driver.findElement(webDriver.By.id('url')).sendKeys('https://www.google.com/')
        await driver.findElement(webDriver.By.id('requestSubmit')).click()
        await delay(12000)
        await bypassConsent(driver, proxy)
        await driver.wait(
            webDriver.until.elementLocated(webDriver.By.css('textarea[name="q"], input[name="q"], [name="q"], [aria-label="Search"]')),
            20000
        )
        var searchBox = await driver.findElement(webDriver.By.css('textarea[name="q"], input[name="q"], [name="q"], [aria-label="Search"]'))
        await typeSlowly(searchBox, keyboard)
        await randomDelay(300, 600)
        await searchBox.sendKeys(webDriver.Key.RETURN)
        await randomDelay(1500, 2500)
        var siteElement = await findSiteUrl(driver, url)
        await randomDelay(800, 1500)
        if (!siteElement)
            siteElement = await nextPage(driver, url, 0)
        await randomDelay(500, 1000)
        if (siteElement) await clickSiteElement(driver, siteElement)
        await organicDwell(driver, url) // Smart browsing
    } catch(e) {
        console.log('[PROXY]: error during proxy search', e.message)
        throw e;
    } finally {
        if (driver){
            try { await driver.quit() } catch(_) {}
            driverList = driverList.filter(d => d.driver !== driver)
        }
    }
}

async function runWorker() {
    while (isRunning && launchQueue.length > 0) {
        const task = launchQueue.shift();
        if (!task) break;

        activeCount++;
        broadcastStats();
        let success = true;
        try {
            await task(); 
        } catch (e) {
            console.log('[WORKER ERROR]:', e.message);
            success = false;
        } finally {
            activeCount--;
            if (success) totalCompleted++;
            else totalFailed++;
            broadcastStats();
        }

        if (isRunning && launchQueue.length > 0) {
            await delay(500); 
        }
    }
}

async function main(url, keyboard, count, option, headless, concurrent, minimizeOption, useProxies = true){
    isRunning = true;
    activeCount = 0;
    totalCompleted = 0;
    totalFailed = 0;
    launchQueue = [];  
    broadcastStats();
    if (launcherInterval) clearInterval(launcherInterval);

    // Load and clean proxy list
    const proxies = await loadproxy();
    const cleanProxies = proxies.map(p => p.trim()).filter(p => p.length > 5);

    console.log(`[${option}]: process started | URL: ${url} | Count: ${count} | MaxTabs: ${concurrent} | Proxies: ${cleanProxies.length} | UseProxies: ${useProxies}`);

    // Populate queue with proxy rotation
    for (let i = 0; i < count; i++) {
        const proxy = (useProxies && cleanProxies.length > 0) ? cleanProxies[i % cleanProxies.length] : null;
        const taskFn = option === "Direct" ? () => Direct(url, headless, proxy, minimizeOption) :
                       option === "Google" ? () => googleSearch(url, keyboard, headless, proxy, minimizeOption) :
                       () => proxyServer(url, keyboard, headless, proxy, minimizeOption);
        launchQueue.push(taskFn);
    }

    // Initial staggered launch (up to concurrent limit)
    const numWorkers = Math.min(concurrent || MAX_CONCURRENT, count);
    for (let i = 0; i < numWorkers; i++) {
        if (!isRunning) break;
        runWorker(); // Start worker (async)
        await delay(2000); // 2s interval for initial launch
    }
}

async function stop(){
    isRunning = false
    if (launcherInterval) {
        clearInterval(launcherInterval);
        launcherInterval = null;
    }
    
    launchQueue = [];
    activeCount = 0;

    // Quit all active drivers immediately
    const driversToQuit = [...driverList];
    driverList = [];
    for (const entry of driversToQuit) {
        try { await entry.driver.quit() } catch(e) {}
    }
    
    broadcastStats();
}

module.exports = {
    main: main,
    stop: stop
}