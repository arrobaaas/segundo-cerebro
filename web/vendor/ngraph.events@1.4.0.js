/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/ngraph.events@1.4.0/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
function a(e){s(e);const t=c(e);return e.on=t.on,e.off=t.off,e.fire=t.fire,e}function c(e){let t=Object.create(null);return{on:function(n,r,f){if(typeof r!="function")throw new Error("callback is expected to be a function");let o=t[n];return o||(o=t[n]=[]),o.push({callback:r,ctx:f}),e},off:function(n,r){if(typeof n>"u")return t=Object.create(null),e;if(t[n])if(typeof r!="function")delete t[n];else{const l=t[n];for(let i=0;i<l.length;++i)l[i].callback===r&&l.splice(i,1)}return e},fire:function(n){const r=t[n];if(!r)return e;let f;arguments.length>1&&(f=Array.prototype.slice.call(arguments,1));for(let o=0;o<r.length;++o){const l=r[o];l.callback.apply(l.ctx,f)}return e}}}function s(e){if(!e)throw new Error("Eventify cannot use falsy object as events subject");const t=["on","fire","off"];for(let n=0;n<t.length;++n)if(e.hasOwnProperty(t[n]))throw new Error("Subject cannot be eventified, since it already has property '"+t[n]+"'")}export{a as default};
