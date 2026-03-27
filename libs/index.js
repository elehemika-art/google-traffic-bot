const webDriver = require('selenium-webdriver')
const chrome = require('selenium-webdriver/chrome')
const chromedriver = new chrome.ServiceBuilder(require('chromedriver').path)

const auto = require('./autobot')
const loadproxy = require('./proxy')
const spoofing = require('./spoofing')

const PERMISSIONS = [
    "--mute-audio",
    "--disable-logging",
    "--disable-infobars",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
    "--no-sandbox",
    "--window-size=1366,768",
]

const MAX_CONCURRENT = 5

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

function findSiteUrl(Driver, url){
    return new Promise(async (r) => {
        try {
            var sites = await Driver.findElements(webDriver.By.className('yuRUbf'))
            for(var i = 0; i < sites.length; i++){
                var target_url = await sites[i].findElement(webDriver.By.tagName('a')).getAttribute('href')
                if(target_url.match(url)){
                    return r(i)
                }
            }
        } catch(e) {
            console.log('[FIND]: error finding site', e.message)
        }
        r(-1)
    })
}

function nextPage(Driver, url, pageCount = 0){
    return new Promise(async (r) => {
        if (pageCount >= 25){
            console.log('[SEARCH]: site not found in 25 pages, stopping')
            return r(0)
        }
        try {
            var nextBtn = await Driver.findElement(webDriver.By.id('pnnext'))
            await nextBtn.click()
        } catch(e) {
            await Driver.executeScript("window.scrollTo(0, document.body.scrollHeight);")
            await randomDelay(1000, 2000)
            try {
                // Modern Google often uses infinite scroll with a 'More results' button
                var moreBtn = await Driver.findElements(webDriver.By.xpath("//*[contains(text(), 'More results') or contains(text(), 'Más resultados') or contains(text(), 'Altre ricerche') or contains(text(), 'Weitere Ergebnisse')]"))
                if (moreBtn.length > 0 && await moreBtn[0].isDisplayed()) {
                    await Driver.executeScript("arguments[0].click();", moreBtn[0])
                }
            } catch (err) {}
        }
        await randomDelay(800, 1500)
        var findURL = await findSiteUrl(Driver, url)
        await randomDelay(800, 1500)
        if(findURL == -1){
            await nextPage(Driver, url, pageCount + 1)
        } else {
            r(findURL)
        }
    })
}

function clickPage(Driver, page_id){
    return new Promise(async (r) => {
        try {
            var sites = await Driver.findElements(webDriver.By.className('yuRUbf'))
            if (!sites[page_id]){
                console.log('[CLICK]: page_id out of range')
                return r(false)
            }
            var targetLink = await sites[page_id].findElement(webDriver.By.tagName('h3')) // Click the title instead of the raw link, which often has better click targets
            await Driver.executeScript("arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});", targetLink);
            await randomDelay(800, 1500)
            await targetLink.click()
            await randomDelay(800, 1500)
            await Driver.executeScript(auto.scroll())
        } catch(e) {
            console.log('[CLICK]: error clicking page', e.message)
            // Fallback click strategy if h3 fails
            try {
                var sites = await Driver.findElements(webDriver.By.css('.yuRUbf a'));
                if (sites[page_id]) {
                    await Driver.executeScript("arguments[0].click();", sites[page_id]);
                    await Driver.executeScript(auto.scroll())
                }
            } catch (fallbackErr) {}
        }
        r(true)
    })
}

async function buildDriver(proxy, headless){
    var options = new chrome.Options()
    if (proxy) {
        // Handle proxies that already include protocol
        const proxyStr = proxy.includes('://') ? proxy : `http://${proxy}`;
        options.addArguments(`--proxy-server=${proxyStr}`);
    }
    if (headless)
        options.addArguments('--headless=new')
    options.addArguments('--no-first-run')
    options.addArguments('--no-default-browser-check')
    PERMISSIONS.forEach(perms => options.addArguments(perms))
    options.excludeSwitches('enable-automation')
    options.excludeSwitches('enable-logging')
    options.addArguments('--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36')
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
        var pageId = await findSiteUrl(driver, url)
        await randomDelay(800, 1500)
        if (pageId == -1)
            pageId = await nextPage(driver, url, 0)
        await randomDelay(500, 1000)
        await clickPage(driver, pageId)
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
        var pageId = await findSiteUrl(driver, url)
        await randomDelay(800, 1500)
        if (pageId == -1)
            pageId = await nextPage(driver, url, 0)
        await randomDelay(500, 1000)
        await clickPage(driver, pageId)
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

    console.log(`[${option}]: process started | URL: ${url} | Count: ${count} | MaxTabs: ${concurrent} | ProxiesMode: ${useProxies}`);

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