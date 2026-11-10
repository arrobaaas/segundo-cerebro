/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/ngraph.forcelayout@3.3.1/index.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import*as xe from"./ngraph.merge@1.0.0.js";import*as Be from"./ngraph.events@1.2.2.js";import*as we from"./ngraph.random@1.1.0.js";function H(u){return u&&Object.prototype.hasOwnProperty.call(u,"default")?u.default:u}var O={exports:{}},k={exports:{}},K,ne;function oe(){return ne||(ne=1,K=function(d){return d===0?"x":d===1?"y":d===2?"z":"c"+(d+1)}),K}var Y,ie;function Q(){if(ie)return Y;ie=1;const u=oe();return Y=function(g){return i;function i(t,v){let f=v&&v.indent||0,m=v&&v.join!==void 0?v.join:`
`,p=Array(f+1).join(" "),s=[];for(let e=0;e<g;++e){let b=u(e),c=e===0?"":p;s.push(c+t.replace(/{var}/g,b))}return s.join(m)}},Y}var ae;function $e(){if(ae)return k.exports;ae=1;const u=Q();k.exports=d,k.exports.generateCreateBodyFunctionBody=g,k.exports.getVectorCode=t,k.exports.getBodyCode=i;function d(v,f){let m=g(v,f),{Body:p}=new Function(m)();return p}function g(v,f){return`
${t(v,f)}
${i(v)}
return {Body: Body, Vector: Vector};
`}function i(v){let f=u(v),m=f("{var}",{join:", "});return`
function Body(${m}) {
  this.isPinned = false;
  this.pos = new Vector(${m});
  this.force = new Vector();
  this.velocity = new Vector();
  this.mass = 1;

  this.springCount = 0;
  this.springLength = 0;
}

Body.prototype.reset = function() {
  this.force.reset();
  this.springCount = 0;
  this.springLength = 0;
}

Body.prototype.setPosition = function (${m}) {
  ${f("this.pos.{var} = {var} || 0;",{indent:2})}
};`}function t(v,f){let m=u(v),p="";return f&&(p=`${m(`
	   var v{var};
	Object.defineProperty(this, '{var}', {
	  set: function(v) { 
	    if (!Number.isFinite(v)) throw new Error('Cannot set non-numbers to {var}');
	    v{var} = v; 
	  },
	  get: function() { return v{var}; }
	});`)}`),`function Vector(${m("{var}",{join:", "})}) {
  ${p}
    if (typeof arguments[0] === 'object') {
      // could be another vector
      let v = arguments[0];
      ${m('if (!Number.isFinite(v.{var})) throw new Error("Expected value is not a finite number at Vector constructor ({var})");',{indent:4})}
      ${m("this.{var} = v.{var};",{indent:4})}
    } else {
      ${m('this.{var} = typeof {var} === "number" ? {var} : 0;',{indent:4})}
    }
  }
  
  Vector.prototype.reset = function () {
    ${m("this.{var} = ",{join:""})}0;
  };`}return k.exports}var S={exports:{}},de;function Ce(){if(de)return S.exports;de=1;const u=Q(),d=oe();S.exports=g,S.exports.generateQuadTreeFunctionBody=i,S.exports.getInsertStackCode=p,S.exports.getQuadNodeCode=m,S.exports.isSamePosition=t,S.exports.getChildBodyCode=f,S.exports.setChildBodyCode=v;function g(s){let e=i(s);return new Function(e)()}function i(s){let e=u(s),b=Math.pow(2,s);return`
${p()}
${m(s)}
${t(s)}
${f(s)}
${v(s)}

function createQuadTree(options, random) {
  options = options || {};
  options.gravity = typeof options.gravity === 'number' ? options.gravity : -1;
  options.theta = typeof options.theta === 'number' ? options.theta : 0.8;

  var gravity = options.gravity;
  var updateQueue = [];
  var insertStack = new InsertStack();
  var theta = options.theta;

  var nodesCache = [];
  var currentInCache = 0;
  var root = newNode();

  return {
    insertBodies: insertBodies,

    /**
     * Gets root node if it is present
     */
    getRoot: function() {
      return root;
    },

    updateBodyForce: update,

    options: function(newOptions) {
      if (newOptions) {
        if (typeof newOptions.gravity === 'number') {
          gravity = newOptions.gravity;
        }
        if (typeof newOptions.theta === 'number') {
          theta = newOptions.theta;
        }

        return this;
      }

      return {
        gravity: gravity,
        theta: theta
      };
    }
  };

  function newNode() {
    // To avoid pressure on GC we reuse nodes.
    var node = nodesCache[currentInCache];
    if (node) {
${C("      node.")}
      node.body = null;
      node.mass = ${e("node.mass_{var} = ",{join:""})}0;
      ${e("node.min_{var} = node.max_{var} = ",{join:""})}0;
    } else {
      node = new QuadNode();
      nodesCache[currentInCache] = node;
    }

    ++currentInCache;
    return node;
  }

  function update(sourceBody) {
    var queue = updateQueue;
    var v;
    ${e("var d{var};",{indent:4})}
    var r; 
    ${e("var f{var} = 0;",{indent:4})}
    var queueLength = 1;
    var shiftIdx = 0;
    var pushIdx = 1;

    queue[0] = root;

    while (queueLength) {
      var node = queue[shiftIdx];
      var body = node.body;

      queueLength -= 1;
      shiftIdx += 1;
      var differentBody = (body !== sourceBody);
      if (body && differentBody) {
        // If the current node is a leaf node (and it is not source body),
        // calculate the force exerted by the current node on body, and add this
        // amount to body's net force.
        ${e("d{var} = body.pos.{var} - sourceBody.pos.{var};",{indent:8})}
        r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});

        if (r === 0) {
          // Poor man's protection against zero distance.
          ${e("d{var} = (random.nextDouble() - 0.5) / 50;",{indent:10})}
          r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});
        }

        // This is standard gravitation force calculation but we divide
        // by r^3 to save two operations when normalizing force vector.
        v = gravity * body.mass * sourceBody.mass / (r * r * r);
        ${e("f{var} += v * d{var};",{indent:8})}
      } else if (differentBody) {
        // Otherwise, calculate the ratio s / r,  where s is the width of the region
        // represented by the internal node, and r is the distance between the body
        // and the node's center-of-mass
        ${e("d{var} = node.mass_{var} / node.mass - sourceBody.pos.{var};",{indent:8})}
        r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});

        if (r === 0) {
          // Sorry about code duplication. I don't want to create many functions
          // right away. Just want to see performance first.
          ${e("d{var} = (random.nextDouble() - 0.5) / 50;",{indent:10})}
          r = Math.sqrt(${e("d{var} * d{var}",{join:" + "})});
        }
        // If s / r < \u03B8, treat this internal node as a single body, and calculate the
        // force it exerts on sourceBody, and add this amount to sourceBody's net force.
        if ((node.max_${d(0)} - node.min_${d(0)}) / r < theta) {
          // in the if statement above we consider node's width only
          // because the region was made into square during tree creation.
          // Thus there is no difference between using width or height.
          v = gravity * node.mass * sourceBody.mass / (r * r * r);
          ${e("f{var} += v * d{var};",{indent:10})}
        } else {
          // Otherwise, run the procedure recursively on each of the current node's children.

          // I intentionally unfolded this loop, to save several CPU cycles.
${l()}
        }
      }
    }

    ${e("sourceBody.force.{var} += f{var};",{indent:4})}
  }

  function insertBodies(bodies) {
    ${e("var {var}min = Number.MAX_VALUE;",{indent:4})}
    ${e("var {var}max = Number.MIN_VALUE;",{indent:4})}
    var i = bodies.length;

    // To reduce quad tree depth we are looking for exact bounding box of all particles.
    while (i--) {
      var pos = bodies[i].pos;
      ${e("if (pos.{var} < {var}min) {var}min = pos.{var};",{indent:6})}
      ${e("if (pos.{var} > {var}max) {var}max = pos.{var};",{indent:6})}
    }

    // Makes the bounds square.
    var maxSideLength = -Infinity;
    ${e("if ({var}max - {var}min > maxSideLength) maxSideLength = {var}max - {var}min ;",{indent:4})}

    currentInCache = 0;
    root = newNode();
    ${e("root.min_{var} = {var}min;",{indent:4})}
    ${e("root.max_{var} = {var}min + maxSideLength;",{indent:4})}

    i = bodies.length - 1;
    if (i >= 0) {
      root.body = bodies[i];
    }
    while (i--) {
      insert(bodies[i], root);
    }
  }

  function insert(newBody) {
    insertStack.reset();
    insertStack.push(root, newBody);

    while (!insertStack.isEmpty()) {
      var stackItem = insertStack.pop();
      var node = stackItem.node;
      var body = stackItem.body;

      if (!node.body) {
        // This is internal node. Update the total mass of the node and center-of-mass.
        ${e("var {var} = body.pos.{var};",{indent:8})}
        node.mass += body.mass;
        ${e("node.mass_{var} += body.mass * {var};",{indent:8})}

        // Recursively insert the body in the appropriate quadrant.
        // But first find the appropriate quadrant.
        var quadIdx = 0; // Assume we are in the 0's quad.
        ${e("var min_{var} = node.min_{var};",{indent:8})}
        ${e("var max_{var} = (min_{var} + node.max_{var}) / 2;",{indent:8})}

${h(8)}

        var child = getChild(node, quadIdx);

        if (!child) {
          // The node is internal but this quadrant is not taken. Add
          // subnode to it.
          child = newNode();
          ${e("child.min_{var} = min_{var};",{indent:10})}
          ${e("child.max_{var} = max_{var};",{indent:10})}
          child.body = body;

          setChild(node, quadIdx, child);
        } else {
          // continue searching in this quadrant.
          insertStack.push(child, body);
        }
      } else {
        // We are trying to add to the leaf node.
        // We have to convert current leaf into internal node
        // and continue adding two nodes.
        var oldBody = node.body;
        node.body = null; // internal nodes do not cary bodies

        if (isSamePosition(oldBody.pos, body.pos)) {
          // Prevent infinite subdivision by bumping one node
          // anywhere in this quadrant
          var retriesCount = 3;
          do {
            var offset = random.nextDouble();
            ${e("var d{var} = (node.max_{var} - node.min_{var}) * offset;",{indent:12})}

            ${e("oldBody.pos.{var} = node.min_{var} + d{var};",{indent:12})}
            retriesCount -= 1;
            // Make sure we don't bump it out of the box. If we do, next iteration should fix it
          } while (retriesCount > 0 && isSamePosition(oldBody.pos, body.pos));

          if (retriesCount === 0 && isSamePosition(oldBody.pos, body.pos)) {
            // This is very bad, we ran out of precision.
            // if we do not return from the method we'll get into
            // infinite loop here. So we sacrifice correctness of layout, and keep the app running
            // Next layout iteration should get larger bounding box in the first step and fix this
            return;
          }
        }
        // Next iteration should subdivide node further.
        insertStack.push(node, oldBody);
        insertStack.push(node, body);
      }
    }
  }
}
return createQuadTree;

`;function h($){let x=[],w=Array($+1).join(" ");for(let F=0;F<s;++F)x.push(w+`if (${d(F)} > max_${d(F)}) {`),x.push(w+`  quadIdx = quadIdx + ${Math.pow(2,F)};`),x.push(w+`  min_${d(F)} = max_${d(F)};`),x.push(w+`  max_${d(F)} = node.max_${d(F)};`),x.push(w+"}");return x.join(`
`)}function l(){let $=Array(11).join(" "),x=[];for(let w=0;w<b;++w)x.push($+`if (node.quad${w}) {`),x.push($+`  queue[pushIdx] = node.quad${w};`),x.push($+"  queueLength += 1;"),x.push($+"  pushIdx += 1;"),x.push($+"}");return x.join(`
`)}function C($){let x=[];for(let w=0;w<b;++w)x.push(`${$}quad${w} = null;`);return x.join(`
`)}}function t(s){let e=u(s);return`
  function isSamePosition(point1, point2) {
    ${e("var d{var} = Math.abs(point1.{var} - point2.{var});",{indent:2})}
  
    return ${e("d{var} < 1e-8",{join:" && "})};
  }  
`}function v(s){var e=Math.pow(2,s);return`
function setChild(node, idx, child) {
  ${b()}
}`;function b(){let c=[];for(let h=0;h<e;++h){let l=h===0?"  ":"  else ";c.push(`${l}if (idx === ${h}) node.quad${h} = child;`)}return c.join(`
`)}}function f(s){return`function getChild(node, idx) {
${e()}
  return null;
}`;function e(){let b=[],c=Math.pow(2,s);for(let h=0;h<c;++h)b.push(`  if (idx === ${h}) return node.quad${h};`);return b.join(`
`)}}function m(s){let e=u(s),b=Math.pow(2,s);var c=`
function QuadNode() {
  // body stored inside this node. In quad tree only leaf nodes (by construction)
  // contain bodies:
  this.body = null;

  // Child nodes are stored in quads. Each quad is presented by number:
  // 0 | 1
  // -----
  // 2 | 3
${h("  this.")}

  // Total mass of current node
  this.mass = 0;

  // Center of mass coordinates
  ${e("this.mass_{var} = 0;",{indent:2})}

  // bounding box coordinates
  ${e("this.min_{var} = 0;",{indent:2})}
  ${e("this.max_{var} = 0;",{indent:2})}
}
`;return c;function h(l){let C=[];for(let $=0;$<b;++$)C.push(`${l}quad${$} = null;`);return C.join(`
`)}}function p(){return`
/**
 * Our implementation of QuadTree is non-recursive to avoid GC hit
 * This data structure represent stack of elements
 * which we are trying to insert into quad tree.
 */
function InsertStack () {
    this.stack = [];
    this.popIdx = 0;
}

InsertStack.prototype = {
    isEmpty: function() {
        return this.popIdx === 0;
    },
    push: function (node, body) {
        var item = this.stack[this.popIdx];
        if (!item) {
            // we are trying to avoid memory pressure: create new element
            // only when absolutely necessary
            this.stack[this.popIdx] = new InsertStackElement(node, body);
        } else {
            item.node = node;
            item.body = body;
        }
        ++this.popIdx;
    },
    pop: function () {
        if (this.popIdx > 0) {
            return this.stack[--this.popIdx];
        }
    },
    reset: function () {
        this.popIdx = 0;
    }
};

function InsertStackElement(node, body) {
    this.node = node; // QuadTree node
    this.body = body; // physical body which needs to be inserted to node
}
`}return S.exports}var D={exports:{}},se;function qe(){if(se)return D.exports;se=1,D.exports=d,D.exports.generateFunctionBody=g;const u=Q();function d(i){let t=g(i);return new Function("bodies","settings","random",t)}function g(i){let t=u(i);return`
  var boundingBox = {
    ${t("min_{var}: 0, max_{var}: 0,",{indent:4})}
  };

  return {
    box: boundingBox,

    update: updateBoundingBox,

    reset: resetBoundingBox,

    getBestNewPosition: function (neighbors) {
      var ${t("base_{var} = 0",{join:", "})};

      if (neighbors.length) {
        for (var i = 0; i < neighbors.length; ++i) {
          let neighborPos = neighbors[i].pos;
          ${t("base_{var} += neighborPos.{var};",{indent:10})}
        }

        ${t("base_{var} /= neighbors.length;",{indent:8})}
      } else {
        ${t("base_{var} = (boundingBox.min_{var} + boundingBox.max_{var}) / 2;",{indent:8})}
      }

      var springLength = settings.springLength;
      return {
        ${t("{var}: base_{var} + (random.nextDouble() - 0.5) * springLength,",{indent:8})}
      };
    }
  };

  function updateBoundingBox() {
    var i = bodies.length;
    if (i === 0) return; // No bodies - no borders.

    ${t("var max_{var} = -Infinity;",{indent:4})}
    ${t("var min_{var} = Infinity;",{indent:4})}

    while(i--) {
      // this is O(n), it could be done faster with quadtree, if we check the root node bounds
      var bodyPos = bodies[i].pos;
      ${t("if (bodyPos.{var} < min_{var}) min_{var} = bodyPos.{var};",{indent:6})}
      ${t("if (bodyPos.{var} > max_{var}) max_{var} = bodyPos.{var};",{indent:6})}
    }

    ${t("boundingBox.min_{var} = min_{var};",{indent:4})}
    ${t("boundingBox.max_{var} = max_{var};",{indent:4})}
  }

  function resetBoundingBox() {
    ${t("boundingBox.min_{var} = boundingBox.max_{var} = 0;",{indent:4})}
  }
`}return D.exports}var A={exports:{}},ue;function Fe(){if(ue)return A.exports;ue=1;const u=Q();A.exports=d,A.exports.generateCreateDragForceFunctionBody=g;function d(i){let t=g(i);return new Function("options",t)}function g(i){return`
  if (!Number.isFinite(options.dragCoefficient)) throw new Error('dragCoefficient is not a finite number');

  return {
    update: function(body) {
      ${u(i)("body.force.{var} -= options.dragCoefficient * body.velocity.{var};",{indent:6})}
    }
  };
`}return A.exports}var R={exports:{}},ce;function _e(){if(ce)return R.exports;ce=1;const u=Q();R.exports=d,R.exports.generateCreateSpringForceFunctionBody=g;function d(i){let t=g(i);return new Function("options","random",t)}function g(i){let t=u(i);return`
  if (!Number.isFinite(options.springCoefficient)) throw new Error('Spring coefficient is not a number');
  if (!Number.isFinite(options.springLength)) throw new Error('Spring length is not a number');

  return {
    /**
     * Updates forces acting on a spring
     */
    update: function (spring) {
      var body1 = spring.from;
      var body2 = spring.to;
      var length = spring.length < 0 ? options.springLength : spring.length;
      ${t("var d{var} = body2.pos.{var} - body1.pos.{var};",{indent:6})}
      var r = Math.sqrt(${t("d{var} * d{var}",{join:" + "})});

      if (r === 0) {
        ${t("d{var} = (random.nextDouble() - 0.5) / 50;",{indent:8})}
        r = Math.sqrt(${t("d{var} * d{var}",{join:" + "})});
      }

      var d = r - length;
      var coefficient = ((spring.coefficient > 0) ? spring.coefficient : options.springCoefficient) * d / r;

      ${t("body1.force.{var} += coefficient * d{var}",{indent:6})};
      body1.springCount += 1;
      body1.springLength += r;

      ${t("body2.force.{var} -= coefficient * d{var}",{indent:6})};
      body2.springCount += 1;
      body2.springLength += r;
    }
  };
`}return R.exports}var W={exports:{}},fe;function Se(){if(fe)return W.exports;fe=1;const u=Q();W.exports=d,W.exports.generateIntegratorFunctionBody=g;function d(i){let t=g(i);return new Function("bodies","timeStep","adaptiveTimeStepWeight",t)}function g(i){let t=u(i);return`
  var length = bodies.length;
  if (length === 0) return 0;

  ${t("var d{var} = 0, t{var} = 0;",{indent:2})}

  for (var i = 0; i < length; ++i) {
    var body = bodies[i];
    if (body.isPinned) continue;

    if (adaptiveTimeStepWeight && body.springCount) {
      timeStep = (adaptiveTimeStepWeight * body.springLength/body.springCount);
    }

    var coeff = timeStep / body.mass;

    ${t("body.velocity.{var} += coeff * body.force.{var};",{indent:4})}
    ${t("var v{var} = body.velocity.{var};",{indent:4})}
    var v = Math.sqrt(${t("v{var} * v{var}",{join:" + "})});

    if (v > 1) {
      // We normalize it so that we move within timeStep range. 
      // for the case when v <= 1 - we let velocity to fade out.
      ${t("body.velocity.{var} = v{var} / v;",{indent:6})}
    }

    ${t("d{var} = timeStep * body.velocity.{var};",{indent:4})}

    ${t("body.pos.{var} += d{var};",{indent:4})}

    ${t("t{var} += Math.abs(d{var});",{indent:4})}
  }

  return (${t("t{var} * t{var}",{join:" + "})})/length;
`}return W.exports}var Z,ve;function Ie(){if(ve)return Z;ve=1,Z=u;function u(d,g,i,t){this.from=d,this.to=g,this.length=i,this.coefficient=t}return Z}var Pe=H(xe),pe=H(Be),Ne=H(we),ee,he;function le(){if(he)return ee;he=1,ee=m;var u=$e(),d=Ce(),g=qe(),i=Fe(),t=_e(),v=Se(),f={};function m(e){var b=Ie(),c=Pe,h=pe;if(e){if(e.springCoeff!==void 0)throw new Error("springCoeff was renamed to springCoefficient");if(e.dragCoeff!==void 0)throw new Error("dragCoeff was renamed to dragCoefficient")}e=c(e,{springLength:10,springCoefficient:.8,gravity:-12,theta:.8,dragCoefficient:.9,timeStep:.5,adaptiveTimeStepWeight:0,dimensions:2,debug:!1});var l=f[e.dimensions];if(!l){var C=e.dimensions;l={Body:u(C,e.debug),createQuadTree:d(C),createBounds:g(C),createDragForce:i(C),createSpringForce:t(C),integrate:v(C)},f[C]=l}var $=l.Body,x=l.createQuadTree,w=l.createBounds,F=l.createDragForce,z=l.createSpringForce,G=l.integrate,U=o=>new $(o),I=Ne.random(42),q=[],_=[],P=x(e,I),E=w(q,e,I),N=z(e,I),J=F(e),L=0,M=[],T=new Map,r=0;B("nbody",me),B("spring",be);var n={bodies:q,quadTree:P,springs:_,settings:e,addForce:B,removeForce:j,getForces:V,step:function(){for(var o=0;o<M.length;++o)M[o](r);var y=G(q,e.timeStep,e.adaptiveTimeStepWeight);return r+=1,y},addBody:function(o){if(!o)throw new Error("Body is required");return q.push(o),o},addBodyAt:function(o){if(!o)throw new Error("Body position is required");var y=U(o);return q.push(y),y},removeBody:function(o){if(o){var y=q.indexOf(o);if(!(y<0))return q.splice(y,1),q.length===0&&E.reset(),!0}},addSpring:function(o,y,X,re){if(!o||!y)throw new Error("Cannot add null spring to force simulator");typeof X!="number"&&(X=-1);var te=new b(o,y,X,re>=0?re:-1);return _.push(te),te},getTotalMovement:function(){return L},removeSpring:function(o){if(o){var y=_.indexOf(o);if(y>-1)return _.splice(y,1),!0}},getBestNewBodyPosition:function(o){return E.getBestNewPosition(o)},getBBox:a,getBoundingBox:a,invalidateBBox:function(){console.warn("invalidateBBox() is deprecated, bounds always recomputed on `getBBox()` call")},gravity:function(o){return o!==void 0?(e.gravity=o,P.options({gravity:o}),this):e.gravity},theta:function(o){return o!==void 0?(e.theta=o,P.options({theta:o}),this):e.theta},random:I};return p(e,n),h(n),n;function a(){return E.update(),E.box}function B(o,y){if(T.has(o))throw new Error("Force "+o+" is already added");T.set(o,y),M.push(y)}function j(o){var y=M.indexOf(T.get(o));y<0||(M.splice(y,1),T.delete(o))}function V(){return T}function me(){if(q.length!==0){P.insertBodies(q);for(var o=q.length;o--;){var y=q[o];y.isPinned||(y.reset(),P.updateBodyForce(y),J.update(y))}}}function be(){for(var o=_.length;o--;)N.update(_[o])}}function p(e,b){for(var c in e)s(e,b,c)}function s(e,b,c){if(e.hasOwnProperty(c)&&typeof b[c]!="function"){var h=Number.isFinite(e[c]);h?b[c]=function(l){if(l!==void 0){if(!Number.isFinite(l))throw new Error("Value of "+c+" should be a valid number.");return e[c]=l,b}return e[c]}:b[c]=function(l){return l!==void 0?(e[c]=l,b):e[c]}}}return ee}var ge;function Me(){if(ge)return O.exports;ge=1,O.exports=d,O.exports.simulator=le();var u=pe;function d(i,t){if(!i)throw new Error("Graph structure cannot be undefined");var v=t&&t.createSimulator||le(),f=v(t);if(Array.isArray(t))throw new Error("Physics settings is expected to be an object");var m=i.version>19?T:M;t&&typeof t.nodeMass=="function"&&(m=t.nodeMass);var p=new Map,s={},e=0,b=f.settings.springTransform||g;U(),F();var c=!1,h={step:function(){if(e===0)return l(!0),!0;var r=f.step();h.lastMove=r,h.fire("step");var n=r/e,a=n<=.01;return l(a),a},getNodePosition:function(r){return L(r).pos},setNodePosition:function(r){var n=L(r);n.setPosition.apply(n,Array.prototype.slice.call(arguments,1))},getLinkPosition:function(r){var n=s[r];if(n)return{from:n.from.pos,to:n.to.pos}},getGraphRect:function(){return f.getBBox()},forEachBody:C,pinNode:function(r,n){var a=L(r.id);a.isPinned=!!n},isNodePinned:function(r){return L(r.id).isPinned},dispose:function(){i.off("changed",G),h.fire("disposed")},getBody:w,getSpring:x,getForceVectorLength:$,simulator:f,graph:i,lastMove:0};return u(h),h;function l(r){c!==r&&(c=r,z(r))}function C(r){p.forEach(r)}function $(){var r=0,n=0;return C(function(a){r+=Math.abs(a.force.x),n+=Math.abs(a.force.y)}),Math.sqrt(r*r+n*n)}function x(r,n){var a;if(n===void 0)typeof r!="object"?a=r:a=r.id;else{var B=i.hasLink(r,n);if(!B)return;a=B.id}return s[a]}function w(r){return p.get(r)}function F(){i.on("changed",G)}function z(r){h.fire("stable",r)}function G(r){for(var n=0;n<r.length;++n){var a=r[n];a.changeType==="add"?(a.node&&I(a.node.id),a.link&&_(a.link)):a.changeType==="remove"&&(a.node&&q(a.node),a.link&&P(a.link))}e=i.getNodesCount()}function U(){e=0,i.forEachNode(function(r){I(r.id),e+=1}),i.forEachLink(_)}function I(r){var n=p.get(r);if(!n){var a=i.getNode(r);if(!a)throw new Error("initBody() was called with unknown node id");var B=a.position;if(!B){var j=E(a);B=f.getBestNewBodyPosition(j)}n=f.addBodyAt(B),n.id=r,p.set(r,n),N(r),J(a)&&(n.isPinned=!0)}}function q(r){var n=r.id,a=p.get(n);a&&(p.delete(n),f.removeBody(a))}function _(r){N(r.fromId),N(r.toId);var n=p.get(r.fromId),a=p.get(r.toId),B=f.addSpring(n,a,r.length);b(r,B),s[r.id]=B}function P(r){var n=s[r.id];if(n){var a=i.getNode(r.fromId),B=i.getNode(r.toId);a&&N(a.id),B&&N(B.id),delete s[r.id],f.removeSpring(n)}}function E(r){var n=[];if(!r.links)return n;for(var a=Math.min(r.links.length,2),B=0;B<a;++B){var j=r.links[B],V=j.fromId!==r.id?p.get(j.fromId):p.get(j.toId);V&&V.pos&&n.push(V)}return n}function N(r){var n=p.get(r);if(n.mass=m(r),Number.isNaN(n.mass))throw new Error("Node mass should be a number")}function J(r){return r&&(r.isPinned||r.data&&r.data.isPinned)}function L(r){var n=p.get(r);return n||(I(r),n=p.get(r)),n}function M(r){var n=i.getLinks(r);return n?1+n.length/3:1}function T(r){var n=i.getLinks(r);return n?1+n.size/3:1}}function g(){}return O.exports}var ye=Me(),Te=ye.simulator;export{ye as default,Te as simulator};
