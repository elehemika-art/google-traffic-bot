$(document).ready(async function() {
    // Load past inputs from localStorage
    if (localStorage.getItem('url')) $("#url").val(localStorage.getItem('url'));
    if (localStorage.getItem('keyboard')) $("#keyboard-i").val(localStorage.getItem('keyboard'));
    if (localStorage.getItem('count')) $("#count").val(localStorage.getItem('count'));
    if (localStorage.getItem('maxTabs')) $("#maxTabs").val(localStorage.getItem('maxTabs'));
    if (localStorage.getItem('option')) {
        $("#option").val(localStorage.getItem('option'));
        if (localStorage.getItem('option') == "Google") $("#keyboard").show();
    }
    if (localStorage.getItem('headless') === 'true') $("#headless").prop('checked', true);
    if (localStorage.getItem('minimize') === 'false') $("#minimize-windows").prop('checked', false);
    if (localStorage.getItem('useProxies') === 'false') $("#use-proxies").prop('checked', false);

    $("#keyboard").hide()
    
    // Setup option descriptions
    const optionDescriptions = {
        "Direct": "Opens your URL directly using your web connection. Fast, but uses your regular IP.",
        "Google": "Goes to Google, searches your keyword, and organically clicks your site.",
        "Proxy": "Hides your IP by searching through a BlockAway proxy server."
    };
    
    function updateOptionDesc() {
        $("#option-desc").text(optionDescriptions[$("#option").val()]);
    }
    updateOptionDesc();

    if ($("#option").val() == "Google") $("#keyboard").show(); // Ensure keyboard shows if Google was saved
    
    // Mutual exclusivity for checkboxes
    function enforceCheckboxRules() {
        if ($("#headless").is(":checked")) {
            $("#minimize-windows").prop("checked", false).prop("disabled", true);
        } else {
            $("#minimize-windows").prop("disabled", false);
        }
    }
    
    $("#headless").change(enforceCheckboxRules);
    
    // Run once on load
    enforceCheckboxRules();

    var porxylist = await window.seo.proxylist()
    $("#proxys").val(porxylist)
    var lastClass = ""
    function alertbox(message, type, timer){
        $("#alert").hide()
        $("#alert").show(500)
        $("#alert").removeClass(lastClass)
        $("#alert").addClass('alert-'+type)
        lastClass = 'alert-'+type
        $("#alert").html(message)
        setTimeout(() => {
            $("#alert").hide(100)
            $("#alert").removeClass('alert-'+type)
            lastClass = ""
        }, timer);
    }

    window.seo.onStatsUpdate((stats) => {
        $("#stat-active").text(stats.active)
        $("#stat-remaining").text(stats.remaining)
        $("#stat-completed").text(stats.completed)
        $("#stat-failed").text(stats.failed)
    })

    $("#start").click(function() {
        var url = $("#url").val()
        var keyboard = $("#keyboard-i").val() || ""
        var count = $("#count").val()
        var maxTabs = $("#maxTabs").val() || 5
        var option = $("#option").val()
        var headless = $("#headless").is(":checked")  // 👈 reads the checkbox
        var minimize = $("#minimize-windows").is(":checked") // 👈 reads the new checkbox
        var useProxies = $("#use-proxies").is(":checked")
        if (url.length < 8) return alertbox("URL cant be empty!", 'danger', 5000)
        if (option == "Google")
            if (keyboard <= 0) return alertbox("Keyboard cant be empty!", 'danger', 5000)
        if (count.length <= 0 || parseInt(count) <= 0) return alertbox("Count cant be zero!", 'danger', 5000)
        
        // Save current inputs to localStorage for next time
        localStorage.setItem('url', url);
        localStorage.setItem('keyboard', keyboard);
        localStorage.setItem('count', count);
        localStorage.setItem('maxTabs', maxTabs);
        localStorage.setItem('option', option);
        localStorage.setItem('headless', headless);
        localStorage.setItem('minimize', minimize);
        localStorage.setItem('useProxies', useProxies);

        window.seo.start(url, keyboard, parseInt(count), option, headless, parseInt(maxTabs), minimize, useProxies)
        alertbox("Process started", 'success', 20000)
    })

    $("#stop").click(function() {
        window.seo.stop()
        alertbox("Process successfully stoped", 'danger', 20000)
    })

    $("#option").change(function(event) {
        updateOptionDesc();
        if (this.value == "Google")
            $("#keyboard").show(500)
        else
            $("#keyboard").hide(500)
    })
})