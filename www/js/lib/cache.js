/**
 * cache.js : Provide a cache for assets from the ZIM archive using indexedDB, localStorage or memory cache
 * 
 * Copyright 2018 Mossroy, Jaifroid and contributors
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
define(['q'], function(Q) {

    var dbName = 'KiwixJS'; // Set the database name here
    var objStore = 'Assets'; // Name of the object store

    /** 
     * Tests the enviornment's caching capabilities and sets assetsCache.capability to the supported level
     * 
     * @param {Function} callback Function to indicate that the capability level has been set
     */
    function test(callback) {
        // Test for indexedDB capability
        if (typeof assetsCache.capability !== 'undefined') {
            callback(true);
            return;
        }
        assetsCache.capability = 'test'; 
        idxDB('count', function(result) {
            if (result !== false) {
                assetsCache.capability = 'indexedDB';
            } else {
                // Test for localCache capability
                if (typeof Storage !== "undefined") {
                    try {
                        // If localStorage is really supported, this won't produce an error
                        var item = window.localStorage.length;
                        assetsCache.capability = 'localStorage';
                    } catch (err) {
                        // Fall back to using memory cache
                        assetsCache.capability = 'memory';
                    }
                }
            }
            console.log('Setting storage type to ' + assetsCache.capability);
            if (assetsCache.capability === 'localStorage') {
                console.log("DEV: 'UnknownError' may be produced as part of capability detection");
            }
            callback(result);
        });
    }

    /**
     * Counts the numnber of cached assets
     * 
     * @param {Function} callback which will receive an array containing [cacheType, cacheCount]
     */
    function count(callback) {
        test(function(result){
            var cacheType = null;
            var cacheCount = null;
            switch (assetsCache.capability) {
                case 'memory':
                    cacheType = 'Memory';
                    cacheCount = assetsCache.size;
                    break;
                case 'localStorage':
                    cacheType = 'LocalStorage';
                    cacheCount = localStorage.length;
                    break;
                case 'indexedDB':
                    cacheType = 'IndexedDB';
                    if (typeof result !== 'boolean' && (result === 0 || result > 0)) { 
                        cacheCount = result;
                    }
                    break;
                default:
                    cacheType = 'No cache';
                    cacheCount = 'null';
            }
            if (cacheCount || cacheCount === 0) {
                callback([cacheType, cacheCount]);
            } else {
                idxDB('count', function(cacheCount) {
                    callback([cacheType, cacheCount]);
                });
            }
        });
    } 

    /**
     * Opens an IndexedDB database and adds or retrieves a key-value pair to it, or performs utility commands
     * on the database
     * 
     * @param {String} keyOrCommand The key of the value to be written or read, or commands 'clear' (clears objStore),
     *     'count' (counts number of objects in objStore), 'delete' (deletes a record with key passed in valueOrCallback)         
     * @param {Variable} valueOrCallback The value to write, or a callback function for read and command transactions
     * @param {Function} callback Callback for write transactions only
     */
    function idxDB(keyOrCommand, valueOrCallback, callback) {
        var value = callback ? valueOrCallback : null;
        var rtnFn = callback || valueOrCallback;
        if (typeof window.indexedDB === 'undefined') {
            rtnFn(false);
            return;
        } 
        
        // Open (or create) the database
        var open = indexedDB.open(dbName, 1);

        open.onerror = function(e) {
            // Suppress error reporting if testing (Firefox supports indexedDB but cannot use it with
            // the file:// protocol, so will report an error)
            if (assetsCache.capability !== 'test') {
                console.error('IndexedDB failed to open: ' + open.error.message);
            }
            rtnFn(false);
        };
        
        // Create the schema
        open.onupgradeneeded = function() {
            var db = open.result;
            var store = db.createObjectStore(objStore);
        };

        open.onsuccess = function() {
            // Start a new transaction
            var db = open.result;
            
            // Set the store to readwrite or read only according to presence or not of value variable
            var tx = value !== null || keyOrCommand === 'clear' ? db.transaction(objStore, "readwrite") : db.transaction(objStore);
            var store = tx.objectStore(objStore);
            
            var processData;
            // Process commands
            if (keyOrCommand === 'clear') {
                // Delete all keys and values in the store
                processData = store.clear();
            } else if (keyOrCommand === 'count') {
                // Count the objects in the store
                processData = store.count();
            } else if (keyOrCommand === 'delete') {
                // Delete the record with key set to value
                processData = store.delete(value);
            } else {
                // Request addition or retrieval of data
                processData = value !== null ? store.put(value, keyOrCommand) : store.get(keyOrCommand);
            }
            // Call the callback with the result
            processData.onsuccess = function(e) {
                if (keyOrCommand === 'delete') {
                    rtnFn(true);
                } else {
                    rtnFn(processData.result);
                }
            };
            processData.onerror = function(e){
                console.error('IndexedDB command failed: ' + processData.error);
                rtnFn(false);
            };

            // Close the db when the transaction is done
            tx.oncomplete = function() {
                db.close();
            };
        };
    }
    
    /**
     * Stores information about the last visited page in a cookie and, if available, in localStorage or indexedDB
     * 
     * @param {String} zimFile The filename (or name of first file in set) of the ZIM archive
     * @param {String} article The URL of the article (including namespace)
     * @param {String} content The content of the page to be stored
     * @param {Function} callback Callback function to report the outcome of the operation
     */
    function setArticle(zimFile, article, content, callback) {
        // Prevent storage if user has deselected the option in Configuration
        if (/rememberLastPage=false\b/i.test(document.cookie)) {
            callback(-1);
            return;
        }
        document.cookie = zimFile + '=' + article + ';expires=Fri, 31 Dec 9999 23:59:59 GMT';
        setItem(zimFile, content, function(response) {
            callback(response);
        });
    }
    
    /**
     * Retrieves article contents from cache only if the article's key has been stored in cookie
     * (since checking the cookie is synchronous, it prevents unnecessary async cache lookups)
     * 
     * @param {String} zimFile The filename (or name of first file in set) of the ZIM archive
     * @param {String} article The URL of the article to be retrieved (including namespace)
     * @param {Function} callback The function to call with the result
     */
    function getArticle(zimFile, article, callback) {
        if (~document.cookie.indexOf(zimFile + '=' + article)) {
            getItem(zimFile, callback);
        } else {
            callback(false);
        }
    }
  
    /**
     * Caches the contents of an asset in memory or local storage
     * 
     * @param {String} key The database key of the asset to cache
     * @param {String} contents The file contents to be stored in the cache
     * @param {Function} callback Callback function to report outcome of operation
     */
    function setItem(key, contents, callback) {
        // Prevent use of storage if user has deselected the option in Configuration
        if (/cacheAssets=false\b/i.test(document.cookie)) {
            callback(-1);
            return;
        }
        // Check if we're actually setting an article 
        // DEV: if any articles are not stored as html files, this regex will need expanding
        var keyArticle = key.match(/([^@]+)@(.+\.html?$)/i);
        if (keyArticle) { // We're setting an article, so go to setArticle function
            setArticle(keyArticle[1], keyArticle[2], contents, callback);
            return;
        }
        if (assetsCache.capability === 'localStorage') {
            localStorage.setItem(key, contents);
        } else {
            assetsCache.set(key, contents);
        }
        if (assetsCache.capability === 'indexedDB') {
            idxDB(key, contents, function(result) {
                callback(result);
            });
        } else {
            callback(key);
        }
    }
    
    /**
     * Retrieves a ZIM file asset that has been cached with the addItem function 
     * either from the memory cache or local storage
     * 
     * @param {String} key The database key of the asset to retrieve
     * @param {Function} callback The function to call with the result
     */
    function getItem(key, callback) {
        // Check if we're actually calling an article 
        // DEV: See above about this regex (may need expanding)
        var keyArticle = key.match(/([^@]+)@(.+\.html?$)/i);
        if (keyArticle) { // We're retrieving an article, so go to getArticle function
            getArticle(keyArticle[1], keyArticle[2], callback);
            return;
        }
        var contents = null;
        if (assetsCache.has(key)) {
            contents = assetsCache.get(key);
        } else if (assetsCache.capability === 'localStorage') {
            contents = localStorage.getItem(key);
        } 
        if (!contents && assetsCache.capability === 'indexedDB') {
            idxDB(key, function(contents) {
                if (contents) {
                    // Also store in fast memory cache to prevent repaints
                    assetsCache.set(key, contents);
                }
                callback(contents);
            });
        } else {
            callback(contents);
        }
    }

    /**
     * Clears caches (including cookie) according to the scope represented by the 'items' variable
     * 
     * @param {String} items Either 'lastpages' (last visited pages of various archives) or 'all'
     * @param {Function} callback Callback function to report the number of items cleared
     */
    function clear(items, callback) {
        if (!/lastpages|all/.test(items)) {
            callback(false);
            return;
        }    
        // Delete cookie entries with a key containing '.zim' or '.zimaa' etc. followed by article namespace
        var itemsCount = 0;
        var key;
        var zimRegExp = /;\s*([^=]+)=([^;]*)/ig;
        var currentCookies = document.cookie;
        var cookieCrumb = zimRegExp.exec(currentCookies);
        while (cookieCrumb !== null) {
            if (/\.zim(\w\w)?=A\//i.test(cookieCrumb[0])) {
                key = cookieCrumb[1];
                // This expiry date will cause the browser to delete the cookie on next page refresh
                document.cookie = key + '=;expires=Thu, 21 Sep 1979 00:00:01 UTC;';
                if (items === 'lastpages') {
                    assetsCache.delete(key);
                    if (assetsCache.capability === 'localStorage') {
                        localStorage.removeItem(key);
                    }
                    if (assetsCache.capability === 'indexedDB') {
                        idxDB('delete', key, function(){});
                    }
                    itemsCount++;
                }
            }
            cookieCrumb = zimRegExp.exec(currentCookies);
        }
        if (items === 'all') {
            var result;
            var capability = assetsCache.capability;
            if (/memory|indexedDB/.test(capability)) {
                itemsCount += assetsCache.size;
                result = "assetsCache";
            }
            // Delete and reinitialize assetsCache
            assetsCache = new Map();
            assetsCache.capability = capability;
            if (capability === 'localStorage') {
                itemsCount += localStorage.length;
                localStorage.clear();
                result = result ? result + " and localStorage" : "localStorage";
            }
            if (capability === 'indexedDB') {
                idxDB('count', function(number) {
                    idxDB('clear', function() {
                        itemsCount += number;
                        callback(itemsCount);
                    });
                });
                result = result ? result + " and indexedDB" : "indexedDB";
            }
        }
        result = result ? result + " (" + itemsCount + " items deleted)" : "no assets to delete";
        console.log("cache.clear: " + result);
        if (capability !== 'indexedDB') {
            callback(itemsCount);
        }
    }

    /**
     * Replaces all CSS links that have the given attribute in the html string with inline script tags containing content
     * from the cache entries corresponding to the given zimFile 
     * Returns the substituted html in the callback function (even if no substitutions were made)
     * 
     * @param {String} html The html string to process
     * @param {String} attribute The attribute that stores the URL to be substituted
     * @param {String} zimFile The name of hte ZIM file (or first file in the file set)
     * @param {Function} callback The function to call with the substituted html
         
     }}
     */
    function replaceCSSLinksWithInlineCSS(html, attribute, zimFile, callback) {
        // This regex creates an array of all link tags that have the given attribute
        var regexpLinksWithAttribute = new RegExp('<link[^>]+?' + attribute + '=["\']([^"\']+)[^>]*>', 'ig');
        var titles = [];
        var linkArray = regexpLinksWithAttribute.exec(html);
        while (linkArray !== null) {
            titles.push([linkArray[0], 
                decodeURIComponent(linkArray[1])]);
            linkArray = regexpLinksWithAttribute.exec(html);
        }
        assetsCache.cssCount = 0;
        assetsCache.cssFulfilled = 0;
        titles.forEach(function(title) {
            getItem(zimFile + '@' + title[1], function(cssContent) {
                assetsCache.cssCount++;
                if (cssContent || cssContent === '') {
                    assetsCache.cssFulfilled++;
                    html = html.replace(title[0], 
                        '<style ' + attribute + '="' + title[1] + '">' + cssContent + '</style>');
                }
                if (assetsCache.cssCount >= titles.length) {
                    assetsCache.cssResolved = true;
                    callback(html);
                }
            });
        });
    }

    
    /** 
     * Wraps a semaphor in a Promise. A function can signal that it is done by setting a sempahor to true, 
     * if it has first set it to false at the outset of the procedure. Ensure no other functions use the same
     * sempahor. The semaphor must be an object key of the app-wide assetsCache object. 
     * 
     * @param {String} semaphor The name of a semaphor key in the assetsCache object
     * @returns {Promise} A promise that resolves when assetsCache[semaphor] is true    
     */  
    function wait(semaphor) {
        var p = Q.Promise(function (resolve) {
            setTimeout(function awaitCache() {
                if (assetsCache[semaphor]) {
                    return resolve();
                }
                setTimeout(awaitCache, 300);
            }, 0);
        });
        return p;
    }

    /**
     * Functions and classes exposed by this module
     */
    return {
        test: test,
        count: count,
        idxDB: idxDB,
        setArticle: setArticle,
        getArticle: getArticle,
        setItem: setItem,
        getItem: getItem,
        clear: clear,
        replaceCSSLinksWithInlineCSS: replaceCSSLinksWithInlineCSS,
        wait: wait
    };
});