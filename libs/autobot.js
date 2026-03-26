function scroll(){
    return `
    if (window.organicScrollInterval) clearInterval(window.organicScrollInterval);
    window.scrollHeight = window.scrollY || 0;
    window.scrollDown = true;
    var scrollValue = 200;
    function random(min, max){
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1) + min);
    }
    window.organicScrollInterval = setInterval(() => {
        var scrollLimit = document.body.offsetHeight - window.innerHeight;
        if (window.scrollDown){
            if (window.scrollHeight < scrollLimit)
                window.scrollHeight += random(50, scrollValue);
            else
                window.scrollDown = false;
        }else{
            if (window.scrollHeight > 0)
                window.scrollHeight -= random(50, scrollValue);
            else
                window.scrollDown = true;
        }
        window.scrollTo(0, (window.scrollHeight > scrollLimit ? scrollLimit : window.scrollHeight < 0 ? 0 : window.scrollHeight))
    }, 1000)
    `
}

module.exports = {
    scroll: scroll
}