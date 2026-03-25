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

function delay(time){
    return new Promise(resolve => setTimeout(resolve, time));
}

function randomDelay(min, max){
    return delay(Math.floor(Math.random() * (max - min + 1)) + min)
}

function Stealth(driver){
    return new Promise(async function(resolve){
        var connection = await driver.createCDPConnection('page')
        await connection.execute('Runtime.enable', {}, null)
        await connection.execute('Page.enable', {}, null)
        await connection.execute("Page.addScriptToEvaluateOnNewDocument", {
            source: spoofing()
        }, null)
        resolve(true)
    })
}

function findSiteUrl(Driver, url){
    return new Promise(async (r) => {
        var sites = await Driver.findElements(webDriver.By.className('yuRUbf'))
        for(var i = 0; i < sites.length; i++){
            var target_url = await sites[i].findElement(webDriver.By.tagName('a')).getAttribute('href')
            if(target_url.match(url)){
                return r(i)
            }
        }
        r(-1)
    });
}

function nextPage(Driver, url, pageCount = 0){
    return new Promise(async (r) => {
        if (pageCount >= 10){
            console.log('[SEARCH]: site not found in 10 pages, stopping')
            return r(0)
        }
        try {
            var nextBtn = await Driver.findElement(webDriver.By.id('pnnext'))
            await nextBtn.click()
        } catch(e) {
            await Driver.executeScript("window.scrollBy(0, 800)")
        }
        await randomDelay(800, 1500)
        var findURL = await findSiteUrl(Driver, url)
        await randomDelay(800, 1500)
        if(findURL == -1){
            await nextPage(Driver, url, pageCount + 1)
        }else{
            r(findURL)
        }
    });
}

function clickPage(Driver, page_id){
    return new Promise(async (r) => {
        var sites = await Driver.findElements(webDriver.By.className('LC20lb MBeuO DKV0Md'))
        await sites[page_id].click()
        await randomDelay(800, 1500)
        await Driver.executeScript(auto.scroll())
        r(true)
    });
}

async function buildDriver(proxy){
    var options = new chrome.Options()
    if (proxy)
        options.addArguments(`--proxy-server=http://${proxy}`)
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

async function bypassConsent(driver){
    await driver.get("https://www.google.com/")
    await randomDelay(1500, 2500)
    try {
        var buttons = await driver.findElements(webDriver.By.css('button'))
        for (var b of buttons){
            var text = await b.getText()
            if (text.includes('Accept') || text.includes('I agree') || text.includes('Agree')){
                await b.click()
                await randomDelay(500, 1000)
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

var driverList = [];

async function Direct(url, proxy){
    var driver = await buildDriver(proxy)
    await Stealth(driver)
    await driver.get(url)
    await randomDelay(800, 1500)
    await driver.executeScript(auto.scroll())
    driverList.push({driver: driver, time: Date.now()})
}

async function googleSearch(url, keyboard){
    var driver = await buildDriver(null)
    await Stealth(driver)
    await bypassConsent(driver)
    await driver.wait(
        webDriver.until.elementLocated(webDriver.By.css('textarea[name="q"], input[name="q"]')),
        10000
    )
    var searchBox = await driver.findElement(webDriver.By.css('textarea[name="q"], input[name="q"]'))
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
    driverList.push({driver: driver, time: Date.now()})
}

async function proxyServer(url, keyboard){
    var driver = await buildDriver(null)
    await Stealth(driver)
    await driver.get('https://www.blockaway.net')
    await driver.findElement(webDriver.By.id('url')).sendKeys('https://www.google.com/')
    await driver.findElement(webDriver.By.id('requestSubmit')).click()
    await delay(12000)
    await bypassConsent(driver)
    await driver.wait(
        webDriver.until.elementLocated(webDriver.By.css('textarea[name="q"], input[name="q"]')),
        10000
    )
    var searchBox = await driver.findElement(webDriver.By.css('textarea[name="q"], input[name="q"]'))
    await typeSlowly(searchBox, keyboard)
    await randomDelay(300, 600)
    await searchBox.sendKeys(webDriver.Key.RETURN)
    await randomDelay(1500, 2500)
    var pageId = await findSiteUrl(driver, url)
    await randomDelay(800, 1500)
    if (pageId == -1)
        pageId = await nextPage(driver, url, 0)
    await randomDelay(500, 1000)
    console.log(pageId)
    await clickPage(driver, pageId)
    driverList.push({driver: driver, time: Date.now()})
}

var usedDriver = 0
async function driverTimeout(){
    setInterval(async () => {
        if (driverList.length > 0)
            for (var i = 0; i < driverList.length; i++){
                if(Date.now() - driverList[i].time > 60000){
                    await driverList[i].driver.quit()
                    driverList.splice(i, 1)
                }
            }
    }, 4000);
}

async function main(url, keyboard, count, option){
    driverTimeout()
    var proxy = await loadproxy()
    if (option == "Direct"){
        console.log("[DIRECT]: process started | URL: " + url)
        while (usedDriver < count){
            await Direct(url, proxy.length > 0 ? proxy[usedDriver] : null)
            usedDriver += 1
        }
    }else if (option == "Google"){
        console.log("[SEARCH]: process started | URL: " + url)
        while (usedDriver < count){
            await googleSearch(url, keyboard)
            usedDriver += 1
        }
    }else if (option == "Proxy"){
        console.log("[PROXY]: process started | URL: " + url)
        while (usedDriver < count){
            await proxyServer(url, keyboard)
            usedDriver += 1
        }
    }
}

async function stop(){
    var stopcount = 0;
    var Interval = setInterval(async ()=>{
        for (var i = 0; i < driverList.length; i++){
            await driverList[i].driver.quit()
            driverList.splice(i, 1)
        }
        if (stopcount > usedDriver)
            clearInterval(Interval)
        stopcount += 1
    }, 2500)
}

module.exports = { 
    main: main,
    stop: stop
}
