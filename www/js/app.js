/**
 * app.js : User Interface implementation
 * This file handles the interaction between the application and the user
 * 
 * Copyright 2013-2014 Mossroy and contributors
 * License GPL v3:
 * 
 * This file is part of Kiwix.
 * 
 * Kiwix is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Kiwix is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Kiwix (file LICENSE-GPLv3.txt).  If not, see <http://www.gnu.org/licenses/>
 */

'use strict';

// This uses require.js to structure javascript:
// http://requirejs.org/docs/api.html#define

define(['jquery', 'zimArchiveLoader', 'util', 'uiUtil', 'cache', 'utf8', 'cookies','abstractFilesystemAccess','q'],
 function($, zimArchiveLoader, util, uiUtil, cache, utf8, cookies, abstractFilesystemAccess, q) {
     
    /**
     * Maximum number of articles to display in a search
     * @type Integer
     */
    var MAX_SEARCH_RESULT_SIZE = 50;

    /**
     * The delay (in milliseconds) between two "keepalive" messages
     * sent to the ServiceWorker (so that it is not stopped by
     * the browser, and keeps the MessageChannel to communicate
     * with the application)
     * @type Integer
     */
    var DELAY_BETWEEN_KEEPALIVE_SERVICEWORKER = 30000;

    /**
     * @type ZIMArchive
     */
    var selectedArchive = null;

    /**
     * Resize the IFrame height, so that it fills the whole available height in the window
     */
    function resizeIFrame() {
        var height = $(window).outerHeight()
                - $("#top").outerHeight(true)
                - $("#articleListWithHeader").outerHeight(true)
                // TODO : this 5 should be dynamically computed, and not hard-coded
                - 5;
        $(".articleIFrame").css("height", height + "px");
    }
    $(document).ready(resizeIFrame);
    $(window).resize(resizeIFrame);
    
    // Define behavior of HTML elements
    $('#searchArticles').on('click', function(e) {
        pushBrowserHistoryState(null, $('#prefix').val());
        searchDirEntriesFromPrefix($('#prefix').val());
        $("#welcomeText").hide();
        $("#readingArticle").hide();
        $("#articleContent").hide();
        if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
            $('#navbarToggle').click();
        }
    });
    $('#formArticleSearch').on('submit', function(e) {
        document.getElementById("searchArticles").click();
        return false;
    });
    $('#prefix').on('keyup', function(e) {
        if (selectedArchive !== null && selectedArchive.isReady()) {
            onKeyUpPrefix(e);
        }
    });
    $("#btnRandomArticle").on("click", function(e) {
        $('#prefix').val("");
        goToRandomArticle();
        $("#welcomeText").hide();
        $('#articleList').hide();
        $('#articleListHeaderMessage').hide();
        $("#readingArticle").hide();
        $('#searchingForArticles').hide();
        if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
            $('#navbarToggle').click();
        }
    });
    $('#btnRescanDeviceStorage').on("click", function(e) {
        searchForArchivesInStorage();
    });
    // Bottom bar :
    $('#btnBack').on('click', function(e) {
        history.back();
        return false;
    });
    $('#btnForward').on('click', function(e) {
        history.forward();
        return false;
    });
    $('#btnHomeBottom').on('click', function(e) {
        $('#btnHome').click();
        return false;
    });
    $('#btnTop').on('click', function(e) {
        $("#articleContent").contents().scrollTop(0);
        // We return true, so that the link to #top is still triggered (useful in the About section)
        return true;
    });
    // Top menu :
    $('#btnHome').on('click', function(e) {
        prepareFormForDisplay();
        $("#welcomeText").show();
        $('#articleListHeaderMessage').show();
        $('#articleContent').show();
        // Give the focus to the search field, and clean up the page contents
        $("#prefix").val("");
        $('#prefix').focus();
        $("#readingArticle").hide();
        if (selectedArchive !== null && selectedArchive.isReady()) {
            $("#welcomeText").hide();
            $("#articleContent").hide();
            goToMainArticle();
        }
        return false;
    });
    $('#btnConfigure').on('click', function(e) {
        // Highlight the selected section in the navbar
        $('#liHomeNav').attr("class","");
        $('#liConfigureNav').attr("class","active");
        $('#liAboutNav').attr("class","");
        if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
            $('#navbarToggle').click();
        }
        // Show the selected content in the page
        $('#about').hide();
        $('#configuration').show();
        $('#formArticleSearch').hide();
        $("#welcomeText").hide();
        $('#articleList').hide();
        $('#articleListHeaderMessage').hide();
        $("#readingArticle").hide();
        $('#articleContent').hide();
        $('#searchingForArticles').hide();
        refreshAPIStatus();
        refreshCacheStatus();
        return false;
    });
    $('#btnAbout').on('click', function(e) {
        // Highlight the selected section in the navbar
        $('#liHomeNav').attr("class","");
        $('#liConfigureNav').attr("class","");
        $('#liAboutNav').attr("class","active");
        if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
            $('#navbarToggle').click();
        }
        // Show the selected content in the page
        $('#about').show();
        $('#configuration').hide();
        $('#formArticleSearch').hide();
        $("#welcomeText").hide();
        $('#articleList').hide();
        $('#articleListHeaderMessage').hide();
        $("#readingArticle").hide();
        $("#articleContent").hide();
        $('#articleContent').hide();
        $('#searchingForArticles').hide();
        return false;
    });
    $('input:radio[name=contentInjectionMode]').on('change', function(e) {
        if (checkWarnServiceWorkerMode(this.value)) {
            // Do the necessary to enable or disable the Service Worker
            setContentInjectionMode(this.value);
        }
        else {
            setContentInjectionMode('jquery');
        }
    });
    document.getElementById('cachedAssetsModeRadioTrue').addEventListener('change', function(e) {
        if (!e.target.checked) return;
        cookies.setItem('cacheAssets', true, Infinity);
        document.getElementById('clearCacheResult').innerHTML = '';
        refreshCacheStatus();
    });
    document.getElementById('cachedAssetsModeRadioFalse').addEventListener('change', function(e) {
        if (!e.target.checked) return;
        cookies.setItem('cacheAssets', false, Infinity);
        cache.clear('all', function(result) {
            refreshCacheStatus();
            document.getElementById('clearCacheResult').innerHTML = 'Items cleared: <b>' + result + '</b>';
        });
    });
    document.getElementById('rememberLastVisitedPageCheck').addEventListener('change', function(e) {
        var rememberLastPage = e.target.checked ? true : false;
        cookies.setItem('rememberLastPage', rememberLastPage, Infinity);
        if (!rememberLastPage) {
            cache.clear('lastpages', refreshCacheStatus);
        } else {
            refreshCacheStatus();
        }
    });
    
    /**
     * Displays of refreshes the API status shown to the user
     */
    function refreshAPIStatus() {
        if (isMessageChannelAvailable()) {
            $('#messageChannelStatus').html("MessageChannel API available");
            $('#messageChannelStatus').removeClass("apiAvailable apiUnavailable")
                    .addClass("apiAvailable");
        } else {
            $('#messageChannelStatus').html("MessageChannel API unavailable");
            $('#messageChannelStatus').removeClass("apiAvailable apiUnavailable")
                    .addClass("apiUnavailable");
        }
        if (isServiceWorkerAvailable()) {
            if (isServiceWorkerReady()) {
                $('#serviceWorkerStatus').html("ServiceWorker API available, and registered");
                $('#serviceWorkerStatus').removeClass("apiAvailable apiUnavailable")
                        .addClass("apiAvailable");
            } else {
                $('#serviceWorkerStatus').html("ServiceWorker API available, but not registered");
                $('#serviceWorkerStatus').removeClass("apiAvailable apiUnavailable")
                        .addClass("apiUnavailable");
            }
        } else {
            $('#serviceWorkerStatus').html("ServiceWorker API unavailable");
            $('#serviceWorkerStatus').removeClass("apiAvailable apiUnavailable")
                    .addClass("apiUnavailable");
        }
    }

    // Refreshes the cache information displayed on the Configuration page
    function refreshCacheStatus() {
        cache.count(function(result) {
            var cacheType = result[0];
            var cacheCount = result[1];
            document.getElementById('cacheStatus').innerHTML = '<span style="white-space:nowrap;">Cache used: <b>' + 
                cacheType + '</b>&nbsp;&nbsp;&nbsp;&nbsp;</span><span style="white-space:nowrap;">Assets: <b>' + cacheCount + '</b></span>';
            var checkCacheAssets = !/cacheAssets=false\b/i.test(document.cookie);
            var cacheSettings = document.getElementById('cacheSettingsDiv');
            var cacheStatusPanel = document.getElementById('cacheStatusPanel');
            [cacheSettings, cacheStatusPanel].forEach(function(panel) {
                panel.classList.remove('panel-success', 'panel-warning');
                if (checkCacheAssets) {
                    panel.classList.add('panel-success');
                } else {
                    panel.classList.add('panel-warning');
                }
            });
            // Update radio buttons and checkbox
            var checkRememberLastPage = !/rememberLastPage=false\b/i.test(document.cookie);
            document.getElementById('rememberLastVisitedPageCheck').checked = checkRememberLastPage;
            document.getElementById('cachedAssetsModeRadio' + (checkCacheAssets ? 'True' : 'False')).checked = true;
        });
    }

    var contentInjectionMode;
    var keepAliveServiceWorkerHandle;
    
    /**
     * Send an 'init' message to the ServiceWorker with a new MessageChannel
     * to initialize it, or to keep it alive.
     * This MessageChannel allows a 2-way communication between the ServiceWorker
     * and the application
     */
    function initOrKeepAliveServiceWorker() {
        if (contentInjectionMode === 'serviceworker') {
            // Create a new messageChannel
            var tmpMessageChannel = new MessageChannel();
            tmpMessageChannel.port1.onmessage = handleMessageChannelMessage;
            // Send the init message to the ServiceWorker, with this MessageChannel as a parameter
            navigator.serviceWorker.controller.postMessage({'action': 'init'}, [tmpMessageChannel.port2]);
            messageChannel = tmpMessageChannel;
            console.log("init message sent to ServiceWorker");
            // Schedule to do it again regularly to keep the 2-way communication alive.
            // See https://github.com/kiwix/kiwix-js/issues/145 to understand why
            clearTimeout(keepAliveServiceWorkerHandle);
            keepAliveServiceWorkerHandle = setTimeout(initOrKeepAliveServiceWorker, DELAY_BETWEEN_KEEPALIVE_SERVICEWORKER, false);
        }
    }
    
    /**
     * Sets the given injection mode.
     * This involves registering (or re-enabling) the Service Worker if necessary
     * It also refreshes the API status for the user afterwards.
     * 
     * @param {String} value The chosen content injection mode : 'jquery' or 'serviceworker'
     */
    function setContentInjectionMode(value) {
        if (value === 'jquery') {
            if (isServiceWorkerReady()) {
                // We need to disable the ServiceWorker
                // Unregistering it does not seem to work as expected : the ServiceWorker
                // is indeed unregistered but still active...
                // So we have to disable it manually (even if it's still registered and active)
                navigator.serviceWorker.controller.postMessage({'action': 'disable'});
                messageChannel = null;
            }
            refreshAPIStatus();
        } else if (value === 'serviceworker') {
            if (!isServiceWorkerAvailable()) {
                alert("The ServiceWorker API is not available on your device. Falling back to JQuery mode");
                setContentInjectionMode('jquery');
                return;
            }
            if (!isMessageChannelAvailable()) {
                alert("The MessageChannel API is not available on your device. Falling back to JQuery mode");
                setContentInjectionMode('jquery');
                return;
            }
            
            if (!isServiceWorkerReady()) {
                $('#serviceWorkerStatus').html("ServiceWorker API available : trying to register it...");
                navigator.serviceWorker.register('../service-worker.js').then(function (reg) {
                    console.log('serviceWorker registered', reg);
                    serviceWorkerRegistration = reg;
                    refreshAPIStatus();
                    
                    // We need to wait for the ServiceWorker to be activated
                    // before sending the first init message
                    var serviceWorker = reg.installing || reg.waiting || reg.active;
                    serviceWorker.addEventListener('statechange', function(statechangeevent) {
                        if (statechangeevent.target.state === 'activated') {
                            // Create the MessageChannel
                            // and send the 'init' message to the ServiceWorker
                            initOrKeepAliveServiceWorker();
                        }
                    });
                    if (serviceWorker.state === 'activated') {
                        // Even if the ServiceWorker is already activated,
                        // We need to re-create the MessageChannel
                        // and send the 'init' message to the ServiceWorker
                        // in case it has been stopped and lost its context
                        initOrKeepAliveServiceWorker();
                    }
                }, function (err) {
                    console.error('error while registering serviceWorker', err);
                    refreshAPIStatus();
                });
            } else {
                initOrKeepAliveServiceWorker();
            }
        }
        $('input:radio[name=contentInjectionMode]').prop('checked', false);
        $('input:radio[name=contentInjectionMode]').filter('[value="' + value + '"]').prop('checked', true);
        contentInjectionMode = value;
        // Save the value in a cookie, so that to be able to keep it after a reload/restart
        cookies.setItem('lastContentInjectionMode', value, Infinity);
    }
    
    /**
     * If the ServiceWorker mode is selected, warn the user before activating it
     * @param chosenContentInjectionMode The mode that the user has chosen
     */
    function checkWarnServiceWorkerMode(chosenContentInjectionMode) {
        if (chosenContentInjectionMode === 'serviceworker' && !cookies.hasItem("warnedServiceWorkerMode")) {
            // The user selected the "serviceworker" mode, which is still unstable
            // So let's display a warning to the user

            // If the focus is on the search field, we have to move it,
            // else the keyboard hides the message
            if ($("#prefix").is(":focus")) {
                $("searchArticles").focus();
            }
            if (confirm("The 'Service Worker' mode is still UNSTABLE for now."
                + " It happens that the application needs to be reinstalled (or the ServiceWorker manually removed)."
                + " Please confirm with OK that you're ready to face this kind of bugs, or click Cancel to stay in 'jQuery' mode.")) {
                // We will not display this warning again for one day
                cookies.setItem("warnedServiceWorkerMode", true, 86400);
                return true;
            }
            else {
                return false;
            }
        }
        return true;
    }
        
    // At launch, we try to set the last content injection mode (stored in a cookie)
    var lastContentInjectionMode = cookies.getItem('lastContentInjectionMode');
    if (lastContentInjectionMode) {
        setContentInjectionMode(lastContentInjectionMode);
    }
    else {
        setContentInjectionMode('jquery');
    }
    
    var serviceWorkerRegistration = null;
    
    // We need to establish the caching capabilities before first page launch
    refreshCacheStatus();
    
    /**
     * Tells if the ServiceWorker API is available
     * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker
     * @returns {Boolean}
     */
    function isServiceWorkerAvailable() {
        return ('serviceWorker' in navigator);
    }
    
    /**
     * Tells if the MessageChannel API is available
     * https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel
     * @returns {Boolean}
     */
    function isMessageChannelAvailable() {
        try{
            var dummyMessageChannel = new MessageChannel();
            if (dummyMessageChannel) return true;
        }
        catch (e){
            return false;
        }
        return false;
    }
    
    /**
     * Tells if the ServiceWorker is registered, and ready to capture HTTP requests
     * and inject content in articles.
     * @returns {Boolean}
     */
    function isServiceWorkerReady() {
        // Return true if the serviceWorkerRegistration is not null and not undefined
        return (serviceWorkerRegistration);
    }
    
    /**
     * 
     * @type Array.<StorageFirefoxOS>
     */
    var storages = [];
    function searchForArchivesInPreferencesOrStorage() {
        // First see if the list of archives is stored in the cookie
        var listOfArchivesFromCookie = cookies.getItem("listOfArchives");
        if (listOfArchivesFromCookie !== null && listOfArchivesFromCookie !== undefined && listOfArchivesFromCookie !== "") {
            var directories = listOfArchivesFromCookie.split('|');
            populateDropDownListOfArchives(directories);
        }
        else {
            searchForArchivesInStorage();
        }
    }

    function searchForArchivesInStorage() {
        // If DeviceStorage is available, we look for archives in it
        $("#btnConfigure").click();
        $('#scanningForArchives').show();
        zimArchiveLoader.scanForArchives(storages, populateDropDownListOfArchives);
    }

    if ($.isFunction(navigator.getDeviceStorages)) {
        // The method getDeviceStorages is available (FxOS>=1.1)
        storages = $.map(navigator.getDeviceStorages("sdcard"), function(s) {
            return new abstractFilesystemAccess.StorageFirefoxOS(s);
        });
    }

    if (storages !== null && storages.length > 0) {
        // Make a fake first access to device storage, in order to ask the user for confirmation if necessary.
        // This way, it is only done once at this moment, instead of being done several times in callbacks
        // After that, we can start looking for archives
        storages[0].get("fake-file-to-read").then(searchForArchivesInPreferencesOrStorage,
                                                  searchForArchivesInPreferencesOrStorage);
    }
    else {
        // If DeviceStorage is not available, we display the file select components
        displayFileSelect();
        if (document.getElementById('archiveFiles').files && document.getElementById('archiveFiles').files.length>0) {
            // Archive files are already selected, 
            setLocalArchiveFromFileSelect();
        }
        else {
            $("#btnConfigure").click();
        }
    }


    // Display the article when the user goes back in the browser history
    window.onpopstate = function(event) {
        if (event.state) {
            var title = event.state.title;
            var titleSearch = event.state.titleSearch;
            
            $('#prefix').val("");
            $("#welcomeText").hide();
            $("#readingArticle").hide();
            if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
                $('#navbarToggle').click();
            }
            $('#searchingForArticles').hide();
            $('#configuration').hide();
            $('#articleList').hide();
            $('#articleListHeaderMessage').hide();
            $('#articleContent').contents().empty();
            
            if (title && !(""===title)) {
                goToArticle(title);
            }
            else if (titleSearch && !(""===titleSearch)) {
                $('#prefix').val(titleSearch);
                searchDirEntriesFromPrefix($('#prefix').val());
            }
        }
    };
    
    /**
     * Populate the drop-down list of archives with the given list
     * @param {Array.<String>} archiveDirectories
     */
    function populateDropDownListOfArchives(archiveDirectories) {
        $('#scanningForArchives').hide();
        $('#chooseArchiveFromLocalStorage').show();
        var comboArchiveList = document.getElementById('archiveList');
        comboArchiveList.options.length = 0;
        for (var i = 0; i < archiveDirectories.length; i++) {
            var archiveDirectory = archiveDirectories[i];
            if (archiveDirectory === "/") {
                alert("It looks like you have put some archive files at the root of your sdcard (or internal storage). Please move them in a subdirectory");
            }
            else {
                comboArchiveList.options[i] = new Option(archiveDirectory, archiveDirectory);
            }
        }
        // Store the list of archives in a cookie, to avoid rescanning at each start
        cookies.setItem("listOfArchives", archiveDirectories.join('|'), Infinity);
        
        $('#archiveList').on('change', setLocalArchiveFromArchiveList);
        if (comboArchiveList.options.length > 0) {
            var lastSelectedArchive = cookies.getItem("lastSelectedArchive");
            if (lastSelectedArchive !== null && lastSelectedArchive !== undefined && lastSelectedArchive !== "") {
                // Attempt to select the corresponding item in the list, if it exists
                if ($("#archiveList option[value='"+lastSelectedArchive+"']").length > 0) {
                    $("#archiveList").val(lastSelectedArchive);
                }
            }
            // Set the localArchive as the last selected (or the first one if it has never been selected)
            setLocalArchiveFromArchiveList();
        }
        else {
            alert("Welcome to Kiwix! This application needs at least a ZIM file in your SD-card (or internal storage). Please download one and put it on the device (see About section). Also check that your device is not connected to a computer through USB device storage (which often locks the SD-card content)");
            $("#btnAbout").click();
            var isAndroid = (navigator.userAgent.indexOf("Android") !== -1);
            if (isAndroid) {
                alert("You seem to be using an Android device. Be aware that there is a bug on Firefox, that prevents finding Wikipedia archives in a SD-card (at least on some devices. See about section). Please put the archive in the internal storage if the application can't find it.");
            }
        }
    }

    /**
     * Sets the localArchive from the selected archive in the drop-down list
     */
    function setLocalArchiveFromArchiveList() {
        var archiveDirectory = $('#archiveList').val();
        if (archiveDirectory && archiveDirectory.length > 0) {
            // Now, try to find which DeviceStorage has been selected by the user
            // It is the prefix of the archive directory
            var regexpStorageName = /^\/([^\/]+)\//;
            var regexpResults = regexpStorageName.exec(archiveDirectory);
            var selectedStorage = null;
            if (regexpResults && regexpResults.length>0) {
                var selectedStorageName = regexpResults[1];
                for (var i=0; i<storages.length; i++) {
                    var storage = storages[i];
                    if (selectedStorageName === storage.storageName) {
                        // We found the selected storage
                        selectedStorage = storage;
                    }
                }
                if (selectedStorage === null) {
                    alert("Unable to find which device storage corresponds to directory " + archiveDirectory);
                }
            }
            else {
                // This happens when the archiveDirectory is not prefixed by the name of the storage
                // (in the Simulator, or with FxOs 1.0, or probably on devices that only have one device storage)
                // In this case, we use the first storage of the list (there should be only one)
                if (storages.length === 1) {
                    selectedStorage = storages[0];
                }
                else {
                    alert("Something weird happened with the DeviceStorage API : found a directory without prefix : "
                        + archiveDirectory + ", but there were " + storages.length
                        + " storages found with getDeviceStorages instead of 1");
                }
            }
            selectedArchive = zimArchiveLoader.loadArchiveFromDeviceStorage(selectedStorage, archiveDirectory, function (archive) {
                cookies.setItem("lastSelectedArchive", archiveDirectory, Infinity);
                // The archive is set : go back to home page to start searching
                var zimFile = archive._file._files[0].name;
                var lastPageUrl = cookies.getItem(zimFile);
                if (lastPageUrl) {
                    $("#welcomeText").hide();
                    prepareFormForDisplay(); 
                    goToArticle(lastPageUrl);
                } else {
                    $("#btnHome").click();
                }
            });
            
        }
    }

    /**
     * Displays the zone to select files from the archive
     */
    function displayFileSelect() {
        $('#openLocalFiles').show();
        $('#archiveFiles').on('change', setLocalArchiveFromFileSelect);
    }

    function setLocalArchiveFromFileList(files) {
        selectedArchive = zimArchiveLoader.loadArchiveFromFiles(files, function (archive) {
            // The archive is set : go to last stored page or home to start searching
            var zimFile = archive._file._files[0].name;
            var lastPageUrl = cookies.getItem(zimFile);
            if (lastPageUrl) {
                $("#welcomeText").hide();
                prepareFormForDisplay();
                goToArticle(lastPageUrl);
            } else {
                $("#btnHome").click();
            }
        });
    }
    /**
     * Sets the localArchive from the File selects populated by user
     */
    function setLocalArchiveFromFileSelect() {
        setLocalArchiveFromFileList(document.getElementById('archiveFiles').files);
    }

    /**
     * Reads a remote archive with given URL, and returns the response in a Promise.
     * This function is used by setRemoteArchives below, for UI tests
     * 
     * @param url The URL of the archive to read
     * @returns {Promise}
     */
    function readRemoteArchive(url) {
        var deferred = q.defer();
        var request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.responseType = "blob";
        request.onreadystatechange = function () {
            if (request.readyState === XMLHttpRequest.DONE) {
                if ((request.status >= 200 && request.status < 300) || request.status === 0) {
                    // Hack to make this look similar to a file
                    request.response.name = url;
                    deferred.resolve(request.response);
                }
                else {
                    deferred.reject("HTTP status " + request.status + " when reading " + url);
                }
            }
        };
        request.onabort = function (e) {
            deferred.reject(e);
        };
        request.send(null);
        return deferred.promise;
    }
    
    /**
     * This is used in the testing interface to inject remote archives
     */
    window.setRemoteArchives = function() {
        var readRequests = [];
        var i;
        for (i = 0; i < arguments.length; i++) {
            readRequests[i] = readRemoteArchive(arguments[i]);
        }
        return q.all(readRequests).then(function(arrayOfArchives) {
            setLocalArchiveFromFileList(arrayOfArchives);
        });
    };

    /**
     * Handle key input in the prefix input zone
     * @param {Event} evt
     */
    function onKeyUpPrefix(evt) {
        // Use a timeout, so that very quick typing does not cause a lot of overhead
        // It is also necessary for the words suggestions to work inside Firefox OS
        if(window.timeoutKeyUpPrefix) {
            window.clearTimeout(window.timeoutKeyUpPrefix);
        }
        window.timeoutKeyUpPrefix = window.setTimeout(function() {
            var prefix = $("#prefix").val();
            if (prefix && prefix.length>0) {
                $('#searchArticles').click();
            }
        }
        ,500);
    }


    /**
     * Search the index for DirEntries with title that start with the given prefix (implemented
     * with a binary search inside the index file)
     * @param {String} prefix
     */
    function searchDirEntriesFromPrefix(prefix) {
        $('#searchingForArticles').show();
        $('#configuration').hide();
        $('#articleContent').contents().empty();
        if (selectedArchive !== null && selectedArchive.isReady()) {
            selectedArchive.findDirEntriesWithPrefix(prefix.trim(), MAX_SEARCH_RESULT_SIZE, populateListOfArticles);
        } else {
            $('#searchingForArticles').hide();
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            alert("Archive not set : please select an archive");
            $("#btnConfigure").click();
        }
    }

  
    /**
     * Display the list of articles with the given array of DirEntry
     * @param {Array.<DirEntry>} dirEntryArray
     * @param {Integer} maxArticles
     */
    function populateListOfArticles(dirEntryArray, maxArticles) {       
        var articleListHeaderMessageDiv = $('#articleListHeaderMessage');
        var nbDirEntry = 0;
        if (dirEntryArray) {
            nbDirEntry = dirEntryArray.length;
        }

        var message;
        if (maxArticles >= 0 && nbDirEntry >= maxArticles) {
            message = maxArticles + " first articles below (refine your search).";
        }
        else {
            message = nbDirEntry + " articles found.";
        }
        if (nbDirEntry === 0) {
            message = "No articles found.";
        }
              
        articleListHeaderMessageDiv.html(message);
        

        var articleListDiv = $('#articleList');
        var articleListDivHtml = "";
        for (var i = 0; i < dirEntryArray.length; i++) {
            var dirEntry = dirEntryArray[i];
            
            articleListDivHtml += "<a href='#' dirEntryId='" + dirEntry.toStringId().replace(/'/g,"&apos;")
                    + "' class='list-group-item'>" + dirEntry.title + "</a>";
        }
        articleListDiv.html(articleListDivHtml);
        $("#articleList a").on("click",handleTitleClick);
        $('#searchingForArticles').hide();
        $('#articleList').show();
        $('#articleListHeaderMessage').show();
    }
    
    /**
     * Handles the click on the title of an article in search results
     * @param {Event} event
     * @returns {Boolean}
     */
    function handleTitleClick(event) {       
        var dirEntryId = event.target.getAttribute("dirEntryId");
        $("#articleList").empty();
        $('#articleListHeaderMessage').empty();
        $("#prefix").val("");
        findDirEntryFromDirEntryIdAndLaunchArticleRead(dirEntryId);
        var dirEntry = selectedArchive.parseDirEntryId(dirEntryId);
        return false;
    }
    

    /**
     * Creates an instance of DirEntry from given dirEntryId (including resolving redirects),
     * and call the function to read the corresponding article
     * @param {String} dirEntryId
     */
    function findDirEntryFromDirEntryIdAndLaunchArticleRead(dirEntryId) {
        if (selectedArchive.isReady()) {
            var dirEntry = selectedArchive.parseDirEntryId(dirEntryId);
            $("#articleName").html(dirEntry.title);
            $("#readingArticle").show();
            $("#articleContent").contents().html("");
            if (dirEntry.isRedirect()) {
                selectedArchive.resolveRedirect(dirEntry, readArticle);
            }
            else {
                readArticle(dirEntry);
            }
        }
        else {
            alert("Data files not set");
        }
    }

    /**
     * Read the article corresponding to the given dirEntry
     * @param {DirEntry} dirEntry
     */
    function readArticle(dirEntry) {
        if (contentInjectionMode === 'serviceworker') {
            // In ServiceWorker mode, we simply set the iframe src.
            // (reading the backend is handled by the ServiceWorker itself)
            // But we still need to empty the article content first.
            $('#articleContent').contents().remove();
            var iframeArticleContent = document.getElementById('articleContent');
            iframeArticleContent.onload = function() {
                // The iframe is empty
                iframeArticleContent.onload = function () {
                    // The content is fully loaded by the browser : we can hide the spinner
                    iframeArticleContent.onload = function () {};
                    $('#cachingCSS').hide();
                    $("#readingArticle").hide();
                };
                iframeArticleContent.src = dirEntry.namespace + "/" + dirEntry.url;
                // Display the iframe content
                $("#articleContent").show();
            };
            iframeArticleContent.src = "article.html";
        } else {
            // In jQuery mode, we read the article content in the backend and manually insert it in the iframe
            if (dirEntry.isRedirect()) {
                selectedArchive.resolveRedirect(dirEntry, readArticle);
            } else {
                $('#articleContent').hide();
                cache.getArticle(dirEntry._zimfile._files[0].name, 
                    dirEntry.namespace + '/' + dirEntry.url,
                    function(htmlContent) {
                        if (htmlContent && /<html[^>]*>/.test(htmlContent)) {
                            displayArticleContentInIframe(dirEntry, htmlContent);
                            console.log('Cache: article contents sent to form [' + dirEntry.url + ']');
                        } else {
                            selectedArchive.readUtf8File(dirEntry, function(fileDirEntry, content) {
                                displayArticleContentInIframe(fileDirEntry, content);
                                cache.setArticle(fileDirEntry._zimfile._files[0].name, 
                                    fileDirEntry.namespace + '/' + fileDirEntry.url, content,
                                    function(response) {
                                        if (response === -1) return; // Cache rejected article due to user settings 
                                        if (response) {
                                            console.log('Cache: stored article contents [' + fileDirEntry.url + ']');
                                        } else {
                                            console.error('Cache: failed to store article contents [' + fileDirEntry.url + ']');
                                        }
                                    }
                                );
                            });
                        }
                    }
                );
            }
        }
    }
    
    var messageChannel;
    
    /**
     * Function that handles a message of the messageChannel.
     * It tries to read the content in the backend, and sends it back to the ServiceWorker
     * @param {Event} event
     */
    function handleMessageChannelMessage(event) {
        if (event.data.error) {
            console.error("Error in MessageChannel", event.data.error);
            reject(event.data.error);
        } else {
            //console.log("the ServiceWorker sent a message on port1", event.data);
            if (event.data.action === "askForContent") {
                var title = event.data.title;
                console.log("ServiceWorker asked for content: " + title);                
                var messagePort = event.ports[0];
                var readFile = function(dirEntry, callback) {
                    if (dirEntry === null) {
                        console.error("Title " + title + " not found in archive.");
                        messagePort.postMessage({'action': 'giveContent', 'title' : title, 'content': ''});
                        if (callback) callback();
                    } else if (dirEntry.isRedirect()) {
                        selectedArchive.resolveRedirect(dirEntry, function(resolvedDirEntry) {
                            var redirectURL = resolvedDirEntry.namespace + "/" +resolvedDirEntry.url;
                            // Ask the ServiceWork to send an HTTP redirect to the browser.
                            // We could send the final content directly, but it is necessary to let the browser know in which directory it ends up.
                            // Else, if the redirect URL is in a different directory than the original URL,
                            // the relative links in the HTML content would fail. See #312
                            messagePort.postMessage({'action':'sendRedirect', 'title':title, 'redirectUrl': redirectURL});
                            console.log("redirect to " + redirectURL + " sent to ServiceWorker");
                            if (callback) callback();                            
                        });
                    } else {
                        console.log("Reading binary file...");
                        selectedArchive.readBinaryFile(dirEntry, function(fileDirEntry, content) {
                            messagePort.postMessage({'action': 'giveContent', 'title' : title, 'content': content});
                            console.log("Content sent to ServiceWorker: " + title);
                            if (callback) callback(fileDirEntry, content);
                        });
                    }
                };
                // Cache intercept for files of type .html, .css (DEV: extend to include .js if they ara to be cached)
                // Sends cached content if it exists, or caches the returned content from readFile() 
                if (/\.html$|\.css$/i.test(title)) {
                    cache.getItem(selectedArchive._file._files[0].name + '@' + title, function(response) {
                        if (response) {
                            messagePort.postMessage({'action': 'giveContent', 'title' : title, 'content': response});
                                console.log('Cache: ' + (/\.html$/i.test(title) ? 'content' : 'asset') + ' sent to ServiceWorker');
                        } else {
                            if (/\.css$/i.test(title) && !/cacheAssets=false\b/i.test(document.cookie)) $('#cachingCSS').show();
                            selectedArchive.getDirEntryByTitle(title)
                            .then(function(dirEntry) {
                                return readFile(dirEntry, function(fileDirEntry, content) {
                                    var textContent = utf8.parse(content);
                                    var zimFile = fileDirEntry._zimfile._files[0].name;
                                    var fullUrl = fileDirEntry.namespace + "/" + fileDirEntry.url;
                                    cache.setItem(zimFile + '@' + fullUrl, textContent, function(result) {
                                        if (result === -1) return; // Cache rejected item due to user settings
                                        if (result) {
                                            console.log('Cache: stored item [' + fullUrl + ']');
                                        } else {
                                             console.error('Cache: failed to store item [' + fullUrl + ']');
                                        }
                                    });
                                });
                            }).fail(function() {
                                messagePort.postMessage({'action': 'giveContent', 'title' : title, 'content': new UInt8Array()});
                            });
                        }
                    });
                } else {
                    selectedArchive.getDirEntryByTitle(title).then(readFile).fail(function() {
                        messagePort.postMessage({'action': 'giveContent', 'title' : title, 'content': new UInt8Array()});
                    });
                }
            }
            else {
                console.error("Invalid message received", event.data);
            }
        }
    }
    
    // Compile some regular expressions needed to modify links
    // Pattern to find the path in a url
    var regexpPath = /^(.*\/)[^\/]+$/;
    // Pattern to find a ZIM URL (with its namespace) - see http://www.openzim.org/wiki/ZIM_file_format#Namespaces
    var regexpZIMUrlWithNamespace = /(?:^|\/)([-ABIJMUVWX]\/.+)/;
    // Pattern to match a local anchor in a href
    var regexpLocalAnchorHref = /^#/;
    // Regex below finds images, scripts and stylesheets with ZIM-type metadata and image namespaces [kiwix-js #378]
    // It first searches for <img, <script, or <link, then scans forward to find, on a word boundary, either src=["'] 
    // OR href=["'] (ignoring any extra whitespace), and it then tests everything up to the next ["'] against a pattern that
    // matches ZIM URLs with namespaces [-I] ("-" = metadata or "I" = image). Finally it removes the relative or absolute path. 
    // DEV: If you want to support more namespaces, add them to the END of the character set [-I] (not to the beginning) 
    var regexpTagsWithZimUrl = /(<(?:img|script|link)\s+[^>]*?\b)(?:src|href)\s*=\s*(["'])\s*(?:\.\.\/|\/)+([-I]\/[^"']*)/ig;
    
    /**
     * Display the the given HTML article in the web page,
     * and convert links to javascript calls
     * NB : in some error cases, the given title can be null, and the htmlArticle contains the error message
     * @param {DirEntry} dirEntry
     * @param {String} htmlArticle
     */
    function displayArticleContentInIframe(dirEntry, htmlArticle) {
        // Scroll the iframe to its top
        $("#articleContent").contents().scrollTop(0);

        // Compute base URL
        var urlPath = regexpPath.test(dirEntry.url) ? urlPath = dirEntry.url.match(regexpPath)[1] : '';
        var baseUrl = dirEntry.namespace + '/' + urlPath;
        // Inject base tag into html
        htmlArticle = htmlArticle.replace(/(<head[^>]*>\s*)/i, '$1<base href="' + baseUrl + '" />\r\n');

        // Replaces ZIM-style URLs of img, script and link tags with a data-url to prevent 404 errors [kiwix-js #272 #376]
        // This replacement also processes the URL to remove the path so that the URL is ready for subsequent jQuery functions
        htmlArticle = htmlArticle.replace(regexpTagsWithZimUrl, '$1data-kiwixurl=$2$3');
        
        // Check to see if the cache contains any of the CSS titles, and if so, pre-load them
        // NB Because this is async, it must be the last manipulation of htmlArticle before injection
        cache.replaceCSSLinksWithInlineCSS(htmlArticle, 'data-kiwixurl', dirEntry._zimfile._files[0].name, 
            function(result) {
                htmlArticle = result;
            }
        );

        // Extract any css classes from the html tag (they will be stripped when injected in iframe with .innerHTML)
        var htmlCSS = htmlArticle.match(/<html[^>]*class\s*=\s*["']\s*([^"']+)/i);
        htmlCSS = htmlCSS ? htmlCSS[1] : '';
        
        // Tell jQuery we're removing the iframe document: clears jQuery cache and prevents memory leaks [kiwix-js #361]
        $('#articleContent').contents().remove();

        var iframeArticleContent = document.getElementById('articleContent');
        
        // Wait for the cache to supply cached assets and then load the blank article to clear the iframe
        cache.wait('cssResolved').then(function() {
            return iframeArticleContent.src = "article.html";
        });
        
        iframeArticleContent.onload = function() {
            var openSectionsWorkaround = function(){
                // Ensure all sections are open for clients that lack JavaScript support, or that have some restrictive CSP [kiwix-js #355].
                // This is needed only for some versions of ZIM files generated by mwoffliner (at least in early 2018), where the article sections are closed by default on small screens.
                // These sections can be opened by clicking on them, but this is done with some javascript.
                // The code below is a workaround, a better fix is tracked on [mwoffliner #324]
                var iframe = document.getElementById('articleContent').contentDocument;
                var collapsedBlocks = iframe.querySelectorAll('.collapsible-block:not(.open-block), .collapsible-heading:not(.open-block)');
                // Using decrementing loop to optimize performance : see https://stackoverflow.com/questions/3520688 
                for (var i = collapsedBlocks.length; i--;) {
                    collapsedBlocks[i].classList.add('open-block');
                }
            };
            
            // Inject the new article's HTML into the iframe
            var articleContent = iframeArticleContent.contentDocument.documentElement;
            articleContent.innerHTML = htmlArticle;
            // Add any missing classes stripped from the <html> tag
            if (htmlCSS) articleContent.getElementsByTagName('body')[0].classList.add(htmlCSS);
            // Allow back/forward in browser history
            pushBrowserHistoryState(dirEntry.namespace + "/" + dirEntry.url);
            parseAnchorsJQuery();
            loadCSSJQuery();
            loadImagesJQuery();
            //JavaScript loading currently disabled
            //loadJavaScriptJQuery();            
        };

        function parseAnchorsJQuery() {
            var currentProtocol = location.protocol;
            var currentHost = location.host;
            $('#articleContent').contents().find('body').find('a').each(function() {
                var href = $(this).attr("href");
                // Compute current link's url (with its namespace), if applicable
                var zimUrl = regexpZIMUrlWithNamespace.test(this.href) ? this.href.match(regexpZIMUrlWithNamespace)[1] : "";
                if (href === null || href === undefined) {
                    // No href attribute
                }
                else if (href.length === 0) {
                    // It's a link with an empty href, pointing to the current page.
                    // Because of the base tag, we need to modify it
                    $(this).on('click', function(e) {
                       return false; 
                    });
                }
                else if (regexpLocalAnchorHref.test(href)) {
                    // It's an anchor link : we need to make it work with javascript
                    // because of the base tag
                    $(this).on('click', function(e) {
                        $('#articleContent').first()[0].contentWindow.location.hash = href;
                        return false;
                    });
                }
                else if (this.protocol !== currentProtocol
                    || this.host !== currentHost) {
                    // It's an external URL : we should open it in a new tab
                    $(this).attr("target", "_blank");
                }
                else {
                    // It's a link to another article
                    // Add an onclick event to go to this article
                    // instead of following the link
                    $(this).on('click', function(e) {
                        var decodedURL = decodeURIComponent(zimUrl);
                        goToArticle(decodedURL);
                        return false;
                    });
                }
            });
        }
        
        function loadImagesJQuery() {
            $('#articleContent').contents().find('body').find('img[data-kiwixurl]').each(function() {
                var image = $(this);
                var imageUrl = image.attr("data-kiwixurl");
                var title = decodeURIComponent(imageUrl);
                selectedArchive.getDirEntryByTitle(title).then(function(dirEntry) {
                    selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, content) {
                        // TODO : use the complete MIME-type of the image (as read from the ZIM file)
                        var url = fileDirEntry.url;
                        // Attempt to construct a generic mimetype first as a catchall
                        var mimetype = url.match(/\.(\w{2,4})$/);
                        mimetype = mimetype ? "image/" + mimetype[1].toLowerCase() : "image";
                        // Then make more specific for known image types
                        mimetype = /\.jpg$/i.test(url) ? "image/jpeg" : mimetype;
                        mimetype = /\.tif$/i.test(url) ? "image/tiff" : mimetype;
                        mimetype = /\.ico$/i.test(url) ? "image/x-icon" : mimetype;
                        mimetype = /\.svg$/i.test(url) ? "image/svg+xml" : mimetype;
                        uiUtil.feedNodeWithBlob(image, 'src', content, mimetype);
                    });
                }).fail(function (e) {
                    console.error("could not find DirEntry for image:" + title, e);
                });
            });
        }

        function loadCSSJQuery() {
            var links = $('#articleContent').contents().find('link[data-kiwixurl]');
            if (links.length && !/cacheAssets=false\b/i.test(document.cookie)) $('#cachingCSS').show();
            links.each(function (index, link) {
                var linkUrl = link.dataset.kiwixurl;
                var title = uiUtil.removeUrlParameters(decodeURIComponent(linkUrl));
                var zimFile = dirEntry._zimfile._files[0].name;
                selectedArchive.getDirEntryByTitle(title).then(function(dirEntry) {
                    return selectedArchive.readUtf8File(dirEntry,
                        function (fileDirEntry, content) {
                            uiUtil.replaceCSSLinkWithInlineCSS(link, content);
                            assetsCache.cssFulfilled++;
                            renderIfCSSFulfilled();
                            var zimFile = fileDirEntry._zimfile._files[0].name;
                            var fullUrl = fileDirEntry.namespace + "/" + fileDirEntry.url;
                            cache.setItem(zimFile + '@' + fullUrl, content, function(result) {
                                if (result === -1) { // Cache rejected item due to user settings, so inject immediately
                                    // Actually, with new technique this probably isn't necessary CHECK
                                    // uiUtil.replaceCSSLinkWithInlineCSS(link, content);
                                    // renderIfCSSFulfilled();
                                    return;
                                } else if (result) {
                                    console.log('Cache: stored asset ' + fullUrl);
                                } else {
                                    console.error('Cache: failed to store asset ' + fullUrl);
                                }
                            });
                        });
                }).fail(function (e) {
                    console.error("Could not find DirEntry for CSS : " + title, e);
                        assetsCache.cssCount--;
                        renderIfCSSFulfilled();
                });
            });
            // Needed in case there are no CSS links (remaining) in the document
            if (!links.length) renderIfCSSFulfilled();

            // Some pages are extremely heavy to render, so we prevent rendering by keeping the iframe hidden
            // until all CSS content is available [kiwix-js #381]
            function renderIfCSSFulfilled() {
                if (assetsCache.cssFulfilled >= assetsCache.cssCount) {
                    $('#cachingCSS').hide();
                    $('#readingArticle').hide();
                    $('#articleContent').show();
                }
            }
        }

        function loadJavaScriptJQuery() {
            $('#articleContent').contents().find('script[data-kiwixurl]').each(function() {
                var script = $(this);
                var scriptUrl = script.attr("data-kiwixurl");
                // TODO check that the type of the script is text/javascript or application/javascript
                var title = uiUtil.removeUrlParameters(decodeURIComponent(scriptUrl));
                selectedArchive.getDirEntryByTitle(title).then(function(dirEntry) {
                    if (dirEntry === null) {
                        console.log("Error: js file not found: " + title);
                    } else {
                        selectedArchive.readBinaryFile(dirEntry, function (fileDirEntry, content) {
                            // TODO : JavaScript support not yet functional [kiwix-js #152]
                            uiUtil.feedNodeWithBlob(script, 'src', content, 'text/javascript');
                        });
                    }
                }).fail(function (e) {
                    console.error("could not find DirEntry for javascript : " + title, e);
                });
            });
        }
    }

    /**
     * Common code for setting up the form for article display
     */
    function prepareFormForDisplay() {
        // Highlight the selected section in the navbar
        $('#liHomeNav').attr("class","active");
        $('#liConfigureNav').attr("class","");
        $('#liAboutNav').attr("class","");
        if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
            $('#navbarToggle').click();
        }
        // Show the selected content in the page
        $('#about').hide();
        $('#configuration').hide();
        $('#formArticleSearch').show();
        $('#articleList').show();
        $("#articleList").empty();
        $('#articleListHeaderMessage').empty();
        $("#articleContent").contents().empty();
        //$('#searchingForArticles').hide();
    }

    /**
     * Changes the URL of the browser page, so that the user might go back to it
     * 
     * @param {String} title
     * @param {String} titleSearch
     */
    function pushBrowserHistoryState(title, titleSearch) {
        var stateObj = {};
        var urlParameters;
        var stateLabel;
        if (title && !(""===title)) {
            // Prevents creating a double history for the same page
            if (history.state && history.state.title === title) return;
            stateObj.title = title;
            urlParameters = "?title=" + title;
            stateLabel = "Wikipedia Article : " + title;
        }
        else if (titleSearch && !(""===titleSearch)) {
            stateObj.titleSearch = titleSearch;
            urlParameters = "?titleSearch=" + titleSearch;
            stateLabel = "Wikipedia search : " + titleSearch;
        }
        else {
            return;
        }
        window.history.pushState(stateObj, stateLabel, urlParameters);
    }


    /**
     * Replace article content with the one of the given title
     * @param {String} title
     */
    function goToArticle(title) {
        title = uiUtil.removeUrlParameters(title);
        selectedArchive.getDirEntryByTitle(title).then(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                $("#readingArticle").hide();
                alert("Article with title " + title + " not found in the archive");
            }
            else {
                $("#articleName").html(title);
                $("#readingArticle").show();
                $('#articleContent').contents().find('body').html("");
                readArticle(dirEntry);
            }
        }).fail(function(e) { alert("Error reading article with title " + title + " : " + e); });
    }
    
    function goToRandomArticle() {
        selectedArchive.getRandomDirEntry(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                alert("Error finding random article.");
            }
            else {
                if (dirEntry.namespace === 'A' && !/^user\//.test(dirEntry.url)) {
                    $("#articleName").html(dirEntry.title);
                    $("#readingArticle").show();
                    $('#articleContent').contents().find('body').html("");
                    readArticle(dirEntry);
                }
                else {
                    // If the random title search did not end up on an article,
                    // we try again, until we find one
                    goToRandomArticle();
                }
            }
        });
    }
    
    function goToMainArticle() {
        selectedArchive.getMainPageDirEntry(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                console.error("Error finding main article.");
                $("#welcomeText").show();
            }
            else {
                if (dirEntry.namespace === 'A') {
                    $("#articleName").html(dirEntry.title);
                    $("#readingArticle").show();
                    $('#articleContent').contents().find('body').html("");
                    readArticle(dirEntry);
                }
                else {
                    console.error("The main page of this archive does not seem to be an article");
                    $("#welcomeText").show();
                }
            }
        });
    }

});
