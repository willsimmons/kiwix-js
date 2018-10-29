/**
 * uiUtil.js : Utility functions for the User Interface
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
define([], function() {

    
    /**
     * Creates a Blob from the given content, then a URL from this Blob
     * And put this URL in the attribute of the DOM node
     * 
     * This is useful to inject images (and other dependencies) inside an article
     * 
     * @param {Object} jQueryNode
     * @param {String} nodeAttribute
     * @param {Uint8Array} content
     * @param {String} mimeType
     */
    function feedNodeWithBlob(jQueryNode, nodeAttribute, content, mimeType) {
        var blob = new Blob([content], {type: mimeType});
        var url = URL.createObjectURL(blob);
        jQueryNode.on('load', function () {
            URL.revokeObjectURL(url);
        });
        jQueryNode.attr(nodeAttribute, url);
    }

    /**
     * Creates a Blob from a supplied script string and attaches it to the
     * specified document or iframe. Attaches to document body in case the 
     * document does not have a head. Returns the new URL for the Blob and
     * sets a callback to run a specified function once the script has loaded
     * 
     * @param {Document} iframe document to which the script should be attached 
     * @param {String} script string containing the script to attach
     * @param {Node} node node object of the original script, if any
     * @param {Boolean} keep set to true to prevent revocation of Blob URL
     * @param {Function} callback a function to run once the script has loaded
     * @returns {String} the URL of the new Blob
     */
    function createScriptBlob(iframe, script, node, keep, callback) {
        var scriptBlob = new Blob([script], { type: 'text/javascript' });
        var scriptUrl = URL.createObjectURL(scriptBlob);
        var newScript = iframe.createElement('script');
        if (node && node.dataset.kiwixsrc) newScript.dataset.kiwixsrc = node.dataset.kiwixsrc;
        newScript.onload = function() {
            if (callback) {
                callback();
            }
            if (!keep) URL.revokeObjectURL(scriptUrl);
        };
        newScript.src = scriptUrl;
        iframe.head.appendChild(newScript);
        return scriptUrl;
    }

    // Similar to above function but uses script data: URI instead of Blob
    // Keep this to ascertain which method works best with various CSPs
    function createScriptDataUri(iframe, script, callback) {
        var scriptDataUri = 'data:text/javascript;charset=UTF-8,' + encodeURIComponent(script);
        var newScript = iframe.createElement('script');
        newScript.src = scriptDataUri;
        iframe.body.appendChild(newScript);
        if (callback) {
            newScript.onload = callback;
        }
    }

    // Compile regular expressions for replaceInlineEvents function
    // This regex matches any tag that contains an on- event attribute; case-sensitivity is intentional for speed
    var regexpFindElesWithEvents = /<(?=[^>]+\son\w+=["'])[^>]+>/g;
    // This regex matches all on- events inside a tag and saves the event name and the script
    // It works with, e.g., onmousover="alert('\"Wow!\"');" and onclick='myfunction("Show \'me\'");'
    var regexpParseInlineEvents = /\s(on\w+)=(["'])\s*((?:\\\2|(?!\2).)+)\2/g;
    
    function replaceInlineEvents(html) {
        var matchCounter = 0;
        var eventsSheet = "";
        html = html.replace(regexpFindElesWithEvents, function(fullTag) {
            var dataKiwixevents = "";
            var match = regexpParseInlineEvents.exec(fullTag);
            while (match) {
                var functionID = match[1] + '_' + matchCounter + '_' + match.index;
                // Store a string version of the function
                eventsSheet += 'function ' + functionID + '() {\r\n' + match[3] + '\r\n}\r\n\r\n';
                dataKiwixevents += functionID + ';';
                match = regexpParseInlineEvents.exec(fullTag);
            }
            fullTag = fullTag.replace(regexpParseInlineEvents, '');
            // Insert the functionID into a data attribute so it can be retrieved for attaching the event
            fullTag = fullTag.replace(/>$/, ' data-kiwixevents="' + dataKiwixevents + '">');
            matchCounter++;
            return fullTag;
        });
        return [html, eventsSheet];
    }
        
    /**
     * Attaches a set of event handlers to corresponding functions in the iframe
     * 
     * @param {String} frame The name of the window to use (either "window" or iframe's element id)
     * @param {Element} el An element as DOM node
     * @param {Array} eventFns A list of event functions to attach to the node.
     * Event functions must have the format "onevent_functionID".
     */
    function attachInlineFunctions(frame, el, eventFns) {
        var context = frame == "window" ? window : document.getElementById(frame).contentWindow;
        for (var e = 0; e < eventFns.length; e++) {
            var thisEvent = eventFns[e].replace(/^on([^_]+).+/, '$1');
            var thisFunction = context[eventFns[e]];
            if (typeof thisFunction === 'function') {
                el.addEventListener(thisEvent, thisFunction);
            } else {
                console.error('[attachInlineFunctions] The specified functions could not be found in the content window!');
            }
        }
    }

    /**
     * Replace the given CSS link (from the DOM) with an inline CSS of the given content
     * 
     * Due to CSP, Firefox OS does not accept <link> syntax with href="data:text/css..." or href="blob:..."
     * So we replace the tag with a <style type="text/css">...</style>
     * while copying some attributes of the original tag
     * Cf http://jonraasch.com/blog/javascript-style-node
     * 
     * @param {Element} link from the DOM
     * @param {String} cssContent
     */
    function replaceCSSLinkWithInlineCSS (link, cssContent) {
        var cssElement = document.createElement('style');
        cssElement.type = 'text/css';
        if (cssElement.styleSheet) {
            cssElement.styleSheet.cssText = cssContent;
        } else {
            cssElement.appendChild(document.createTextNode(cssContent));
        }
        var mediaAttributeValue = link.attr('media');
        if (mediaAttributeValue) {
            cssElement.media = mediaAttributeValue;
        }
        var disabledAttributeValue = link.attr('disabled');
        if (disabledAttributeValue) {
            cssElement.disabled = disabledAttributeValue;
        }
        link.replaceWith(cssElement);
    }
        
    var regexpRemoveUrlParameters = new RegExp(/([^?#]+)[?#].*$/);
    
    /**
     * Removes parameters and anchors from a URL
     * @param {type} url
     * @returns {String} same URL without its parameters and anchors
     */
    function removeUrlParameters(url) {
        return url.replace(regexpRemoveUrlParameters, "$1");
    }

    /**
     * Functions and classes exposed by this module
     */
    return {
        feedNodeWithBlob: feedNodeWithBlob,
        createScriptBlob: createScriptBlob,
        createScriptDataUri: createScriptDataUri,
        replaceInlineEvents: replaceInlineEvents,
        attachInlineFunctions: attachInlineFunctions,
        replaceCSSLinkWithInlineCSS: replaceCSSLinkWithInlineCSS,
        removeUrlParameters: removeUrlParameters
    };
});
