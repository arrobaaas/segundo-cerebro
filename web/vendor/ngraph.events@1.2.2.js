/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/ngraph.events@1.2.2/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var v,u;function s(){if(u)return v;u=1,v=function(r){p(r);var e=l(r);return r.on=e.on,r.off=e.off,r.fire=e.fire,r};function l(n){var r=Object.create(null);return{on:function(e,t,o){if(typeof t!="function")throw new Error("callback is expected to be a function");var f=r[e];return f||(f=r[e]=[]),f.push({callback:t,ctx:o}),n},off:function(e,t){var o=typeof e>"u";if(o)return r=Object.create(null),n;if(r[e]){var f=typeof t!="function";if(f)delete r[e];else for(var a=r[e],i=0;i<a.length;++i)a[i].callback===t&&a.splice(i,1)}return n},fire:function(e){var t=r[e];if(!t)return n;var o;arguments.length>1&&(o=Array.prototype.splice.call(arguments,1));for(var f=0;f<t.length;++f){var a=t[f];a.callback.apply(a.ctx,o)}return n}}}function p(n){if(!n)throw new Error("Eventify cannot use falsy object as events subject");for(var r=["on","fire","off"],e=0;e<r.length;++e)if(n.hasOwnProperty(r[e]))throw new Error("Subject cannot be eventified, since it already has property '"+r[e]+"'")}return v}var c=s();export{c as default};
