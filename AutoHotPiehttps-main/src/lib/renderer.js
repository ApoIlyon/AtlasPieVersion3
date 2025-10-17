// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

//Hide page tabs

document.getElementsByName("hidden-tab-items").forEach(function(tabs,index){
    tabs.style.display = "none"
})

iconManager.refreshIconLibrary();
font.refresh();


function rgbaArrayToCssColor(colorArray) {
    if (!Array.isArray(colorArray)) {
        return "rgba(0, 0, 0, 1)";
    }

    const clampByte = (value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
    const [r = 0, g = 0, b = 0] = colorArray;
    let alpha = colorArray.length > 3 ? Number(colorArray[3]) : 255;

    if (Number.isNaN(alpha)) {
        alpha = 255;
    }

    if (alpha > 1) {
        alpha = Math.max(0, Math.min(255, alpha)) / 255;
    } else {
        alpha = Math.max(0, Math.min(1, alpha));
    }

    const formattedAlpha = Number(alpha.toFixed(2));

    return `rgba(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)}, ${formattedAlpha})`;
}

function cssColorToRgba(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return [0, 0, 0, 255];
    }

    const color = value.trim();

    let match = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (match) {
        const r = Math.max(0, Math.min(255, Math.round(parseFloat(match[1]))));
        const g = Math.max(0, Math.min(255, Math.round(parseFloat(match[2]))));
        const b = Math.max(0, Math.min(255, Math.round(parseFloat(match[3]))));
        let a = match[4] !== undefined ? parseFloat(match[4]) : 1;
        if (Number.isNaN(a)) {
            a = 1;
        }
        if (a > 1) {
            a = Math.max(0, Math.min(255, a)) / 255;
        } else {
            a = Math.max(0, Math.min(1, a));
        }
        return [r, g, b, Math.round(a * 255)];
    }

    match = color.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
    if (match) {
        const hex = match[1];
        const alpha = match[2];
        return [
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16),
            alpha ? parseInt(alpha, 16) : 255,
        ];
    }

    return [0, 0, 0, 255];
}

function rgbLightness(rgbArray){
    rgbArray[0]
    return (0.299*(rgbArray[0]/255) + 0.587*(rgbArray[1]/255) + 0.114*(rgbArray[2]/255))
}


function getKeyByValue(object, value) {
    return Object.keys(object).find(key => object[key] === value);
}

function getIndexOfObjByKeyValue(objects, key, value){
    objects.forEach(function(val, index){
        if(val[key] == value){
            return index
        }
    })
};

function calcAngle(aX,aY,bX,bY){
    let initVal = Math.atan2(bY-aY,bX-aX)*(180/Math.PI)
    if (initVal < 0){
        return initVal+360        
    } else {
        return initVal
    }
}
function cycleRange(num, range=360){
    let returnNum = num - (range*Math.floor(num/range))
    return returnNum
}

function extendAlongAngle(iPos, theta, distance){
    var fPosX = Math.round(iPos[0]+(distance*Math.cos((theta-90)*(Math.PI/180))))		
	var fPosY = Math.round(iPos[1]+(distance*Math.sin((theta-90)*(Math.PI/180))))
    return [fPosX,fPosY]
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof stroke === 'undefined') {
      stroke = true;
    }
    if (typeof radius === 'undefined') {
      radius = 5;
    }
    if (typeof radius === 'number') {
      radius = {tl: radius, tr: radius, br: radius, bl: radius};
    } else {
      var defaultRadius = {tl: 0, tr: 0, br: 0, bl: 0};
      for (var side in defaultRadius) {
        radius[side] = radius[side] || defaultRadius[side];
      }
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) {
      ctx.fill();
    }
    if (stroke) {
      ctx.stroke();
    }  
  }

function degreesToRadians(numDegrees){
    return numDegrees*(Math.PI/180)      
}

function IsNumeric(input)
{
    return (input - 0) == input && (''+input).trim().length > 0;
}

function isObject(obj){
    return Object.prototype.toString.call(obj) === '[object Object]';
};

function throttle(func, interval) {    
    var lastCall = 0;
    return function() {
        var now = getNow();
        if (lastCall + interval < now) {
            lastCall = now;
            return func.apply(this, arguments);
        }
    };
}

function RunPieMenuApp(){
    runningPieMenu.open();
    setTimeout(function(){attemptPieMenuAppRun();},5)
    function attemptPieMenuAppRun(){
        pieMenus.run(AutoHotPieSettings.global.startup.runAHKPieMenus).then(val => {
            console.log("Pie Menus are running!");
            closeWindow();
        },val => {
            console.log("Pie Menus timed out.  No pie menus for you.");
            closeWindow();
        })
    };    
}

//Set JSColor default
jscolor.presets.default = {
	backgroundColor:'rgba(68,68,68,1)', hash:false, hideOnPaletteClick:true, shadowColor:'rgba(0,0,0,0.65)', borderRadius:2, borderWidth:0, previewSize:50, width:300, height:150,
    pointerThickness:1, format:'rgba', alphaChannel:true
};
jscolor.install();
// electron.addErrorListener();

