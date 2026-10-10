/*ColorPanel.js 取色面板
  只认「给我一个容器，我管一个颜色」，不知道网站的存在*/

(function () {
    'use strict';

    /*十六进制转RGB，非法输入返回null*/
    function hexToRgb(hex) {
        let cleaned = String(hex).trim().replace(/^#/, '');
        if (cleaned.length === 3) {
            /*支持#abc简写*/
            cleaned = cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2];
        }
        if (!/^[0-9a-f]{6}$/i.test(cleaned)) return null;
        const number = parseInt(cleaned, 16);
        return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
    }

    /*RGB转十六进制*/
    function rgbToHex(rgb) {
        const toHexPart = value => Math.round(value).toString(16).padStart(2, '0').toUpperCase();
        return '#' + toHexPart(rgb.r) + toHexPart(rgb.g) + toHexPart(rgb.b);
    }

    /*RGB转HSV，h是0-360 s和v是0-100*/
    function rgbToHsv(rgb) {
        const red = rgb.r / 255, green = rgb.g / 255, blue = rgb.b / 255;
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const delta = maximum - minimum;

        let hue = 0;
        if (delta !== 0) {
            if (maximum === red)        hue = 60 * (((green - blue) / delta) % 6);
            else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
            else                        hue = 60 * ((red - green) / delta + 4);
        }
        if (hue < 0) hue += 360;

        return {
            h: hue,
            s: maximum === 0 ? 0 : (delta / maximum) * 100,
            v: maximum * 100
        };
    }

    /*HSV转RGB*/
    function hsvToRgb(hsv) {
        const hue = hsv.h, saturation = hsv.s / 100, value = hsv.v / 100;
        const chroma = value * saturation;
        const intermediate = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
        const match = value - chroma;

        let red = 0, green = 0, blue = 0;
        if      (hue < 60)  { red = chroma;         green = intermediate; }
        else if (hue < 120) { red = intermediate;   green = chroma; }
        else if (hue < 180) { green = chroma;       blue = intermediate; }
        else if (hue < 240) { green = intermediate; blue = chroma; }
        else if (hue < 300) { red = intermediate;   blue = chroma; }
        else                { red = chroma;         blue = intermediate; }

        return {
            r: (red + match) * 255,
            g: (green + match) * 255,
            b: (blue + match) * 255
        };
    }

    /*取某点HSV对应的css颜色字符串*/
    function hsvToCssColor(hue, saturation, value) {
        const rgb = hsvToRgb({ h: hue, s: saturation, v: value });
        return 'rgb(' + Math.round(rgb.r) + ',' + Math.round(rgb.g) + ',' + Math.round(rgb.b) + ')';
    }

    /*色相轴，固定满饱和彩虹，不随S V变化*/
    function hueAxisGradient() {
        const colorStops = [];
        for (let index = 0; index <= 12; index++) {
            const percent = (index / 12 * 100).toFixed(1);
            colorStops.push(hsvToCssColor(index * 30, 100, 100) + ' ' + percent + '%');
        }
        return 'linear-gradient(to right, ' + colorStops.join(', ') + ')';
    }

    /*饱和度轴，两端用当前H和V*/
    function saturationAxisGradient(hsv) {
        return 'linear-gradient(to right, ' + hsvToCssColor(hsv.h, 0, hsv.v)
             + ', ' + hsvToCssColor(hsv.h, 100, hsv.v) + ')';
    }

    /*明度轴，两端用当前H和S*/
    function valueAxisGradient(hsv) {
        return 'linear-gradient(to right, ' + hsvToCssColor(hsv.h, hsv.s, 0)
             + ', ' + hsvToCssColor(hsv.h, hsv.s, 100) + ')';
    }

    /*RGB轴，只有目标分量变化*/
    function rgbAxisGradient(channelKey, rgb) {
        const colorAt = channelValue => {
            const color = { r: rgb.r, g: rgb.g, b: rgb.b };
            color[channelKey] = channelValue;
            return 'rgb(' + Math.round(color.r) + ',' + Math.round(color.g) + ',' + Math.round(color.b) + ')';
        };
        return 'linear-gradient(to right, ' + colorAt(0) + ', ' + colorAt(255) + ')';
    }

    /*六个轴的配置*/
    const AXIS_CONFIG = [
        { key: 'r', name: 'R', minimum: 0, maximum: 255, group: 'rgb' },
        { key: 'g', name: 'G', minimum: 0, maximum: 255, group: 'rgb' },
        { key: 'b', name: 'B', minimum: 0, maximum: 255, group: 'rgb' },
        { key: 'h', name: 'H', minimum: 0, maximum: 360, group: 'hsv' },
        { key: 's', name: 'S', minimum: 0, maximum: 100, group: 'hsv' },
        { key: 'v', name: 'V', minimum: 0, maximum: 100, group: 'hsv' }
    ];

    class ColorPanel {
        constructor(container, options) {
            const settings = options || {};

            this.element = container;
            this.onChange = settings.onChange || function () {};
            this.element.classList.add('ColorPanel');
            this.element.innerHTML = this.headMarkup() + this.tabsMarkup() + this.axisGroupsMarkup();

            /*元素引用抓在手里*/
            this.tabButtons     = this.element.querySelectorAll('.ColorPanelTab');
            this.previewElement = this.element.querySelector('.ColorPanelPreview');
            this.hexInput       = this.element.querySelector('.ColorPanelHex');
            this.rangeInputs    = {};
            this.numberInputs   = {};
            this.markerElements = {};
            this.trackElements  = {};
            this.fieldElements  = {};
            this.groupElements  = {};

            this.element.querySelectorAll('.ColorPanelGroup').forEach(groupElement => {
                this.groupElements[groupElement.dataset.axisGroup] = groupElement;
            });

            this.element.querySelectorAll('.ColorPanelAxis').forEach(axisRow => {
                const axisKey = axisRow.dataset.axisKey;
                this.rangeInputs[axisKey]    = axisRow.querySelector('.ColorPanelAxisRange');
                this.numberInputs[axisKey]   = axisRow.querySelector('.ColorPanelAxisNumber');
                this.markerElements[axisKey] = axisRow.querySelector('.ColorPanelAxisMarker');
                this.trackElements[axisKey]  = axisRow.querySelector('.ColorPanelAxisTrack');
                this.fieldElements[axisKey]  = axisRow.querySelector('.ColorPanelAxisField');
            });

            /*RGB是主数据，HSV是用来编辑的视图*/
            this.rgb = { r: 128, g: 128, b: 128 };
            this.hsv = { h: 0, s: 0, v: 50 };

            this.bindTabs();
            this.bindHexInput();
            AXIS_CONFIG.forEach(axis => {
                this.bindAxisPointer(axis);
                this.bindAxisKeyboard(axis);
                this.bindNumberInput(axis);
            });

            this.setFromRgb(hexToRgb(settings.initialColor || '#808080'));
        }

        /* ==================== 状态 ==================== */

        /*颜色从RGB来：重算HSV，但无彩色时保留上一次的色相*/
        setFromRgb(rgb) {
            this.rgb = { r: rgb.r, g: rgb.g, b: rgb.b };

            const derived = rgbToHsv(this.rgb);
            /*黑色和灰色没有色相，用上一次的值顶上，否则拖到黑就丢了*/
            if (derived.s === 0 || derived.v === 0) derived.h = this.hsv.h;
            if (derived.v === 0) derived.s = this.hsv.s;
            this.hsv = derived;

            this.render();
            this.onChange(rgbToHex(this.rgb));
        }

        /*颜色从HSV来：直接采用，再算RGB*/
        setFromHsv(hsv) {
            this.hsv = { h: hsv.h, s: hsv.s, v: hsv.v };
            this.rgb = hsvToRgb(this.hsv);

            this.render();
            this.onChange(rgbToHex(this.rgb));
        }

        /*改某一个轴的值，按它属于哪一组走对应的入口*/
        applyAxisValue(axis, value) {
            if (axis.group === 'rgb') {
                const rgb = { r: this.rgb.r, g: this.rgb.g, b: this.rgb.b };
                rgb[axis.key] = value;
                this.setFromRgb(rgb);
            } else {
                const hsv = { h: this.hsv.h, s: this.hsv.s, v: this.hsv.v };
                hsv[axis.key] = value;
                this.setFromHsv(hsv);
            }
        }

        /* ==================== 渲染 ==================== */

        render() {
            const hex = rgbToHex(this.rgb);
            this.previewElement.style.background = hex;

            /*正在输入的框不要覆盖，否则光标会跳*/
            if (document.activeElement !== this.hexInput) {
                this.hexInput.value = hex.slice(1);
            }

            AXIS_CONFIG.forEach(axis => this.renderAxis(axis));
        }

        renderAxis(axis) {
            const key = axis.key;
            const value = axis.group === 'rgb' ? this.rgb[key] : this.hsv[key];

            this.rangeInputs[key].value = value;

            if (document.activeElement !== this.numberInputs[key]) {
                this.numberInputs[key].value = Math.round(value);
            }

            /*三角位置，和点击位置用同一套算法，所以拖到哪就指到哪*/
            const fraction = (value - axis.minimum) / (axis.maximum - axis.minimum);
            this.markerElements[key].style.left = (fraction * 100) + '%';

            /*只改background-image，用简写会把CSS里的no-repeat和100% 100%清掉*/
            this.trackElements[key].style.backgroundImage = this.axisGradientOf(axis);
        }

        axisGradientOf(axis) {
            if (axis.key === 'h') return hueAxisGradient();
            if (axis.key === 's') return saturationAxisGradient(this.hsv);
            if (axis.key === 'v') return valueAxisGradient(this.hsv);
            return rgbAxisGradient(axis.key, this.rgb);
        }

        /* ==================== 事件 ==================== */

        /*鼠标点哪三角就去哪，按住不放能连续拖*/
        bindAxisPointer(axis) {
            const field = this.fieldElements[axis.key];

            const applyPointer = event => {
                const rect = field.getBoundingClientRect();
                const rawFraction = (event.clientX - rect.left) / rect.width;
                const fraction = Math.min(1, Math.max(0, rawFraction));
                this.applyAxisValue(axis,
                    Math.round(axis.minimum + fraction * (axis.maximum - axis.minimum)));
            };

            field.addEventListener('pointerdown', event => {
                field.setPointerCapture(event.pointerId);
                applyPointer(event);
                event.preventDefault();
            });

            field.addEventListener('pointermove', event => {
                if (!field.hasPointerCapture(event.pointerId)) return;
                applyPointer(event);
            });

            field.addEventListener('pointerup', event => {
                if (field.hasPointerCapture(event.pointerId)) {
                    field.releasePointerCapture(event.pointerId);
                }
            });
        }

        /*原生滑块只管键盘，方向键按一下也要同步*/
        bindAxisKeyboard(axis) {
            this.rangeInputs[axis.key].addEventListener('input', () => {
                this.applyAxisValue(axis, Number(this.rangeInputs[axis.key].value));
            });
        }

        /*数字框：超出范围压回边界，离开时把显示拉回真实值*/
        bindNumberInput(axis) {
            const input = this.numberInputs[axis.key];

            input.addEventListener('input', () => {
                const digits = input.value.replace(/[^0-9]/g, '');
                if (digits === '') return; /*还没打完就先不动颜色*/
                const value = Math.min(axis.maximum, Math.max(axis.minimum, parseInt(digits, 10)));
                this.applyAxisValue(axis, value);
            });

            input.addEventListener('blur', () => this.render());
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') input.blur();
            });
        }

        /*色号框：先剔除非法字符再截断，粘贴带井号也不会丢字符*/
        bindHexInput() {
            const input = this.hexInput;

            input.addEventListener('input', () => {
                const filtered = input.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
                if (filtered !== input.value) input.value = filtered;
                if (filtered.length === 6) this.setFromRgb(hexToRgb(filtered));
            });

            input.addEventListener('blur', () => {
                /*三位简写离开时补全，其余情况拉回真实值*/
                if (input.value.length === 3) this.setFromRgb(hexToRgb(input.value));
                else this.render();
            });
        }

        /*两个页标各自开关一组轴*/
        bindTabs() {
            this.tabButtons.forEach(button => {
                button.classList.add('isOpened');
                button.addEventListener('click', () => {
                    const groupElement = this.groupElements[button.dataset.axisGroup];
                    groupElement.hidden = !groupElement.hidden;
                    button.classList.toggle('isOpened', !groupElement.hidden);
                });
            });
        }

        /* ==================== 结构 ==================== */

        /*顶端两个页标，各自开关一组轴*/
        tabsMarkup() {
            return `<div class="ColorPanelTabs">
                        <button type="button" class="ColorPanelTab" data-axis-group="rgb">RGB</button>
                        <button type="button" class="ColorPanelTab" data-axis-group="hsv">HSV</button>
                    </div>`;
        }

        /*预览色块和色号输入，任何时候都在*/
        headMarkup() {
            return `<div class="ColorPanelHead">
                        <div class="ColorPanelPreview"></div>
                        <div class="ColorPanelHexField">
                            <span class="ColorPanelHexPrefix">#</span>
                            <input class="ColorPanelHex" type="text"
                                   spellcheck="false" autocomplete="off">
                        </div>
                    </div>`;
        }

        /*两组轴，顺序由AXIS_CONFIG决定*/
        axisGroupsMarkup() {
            let markup = '';
            let currentGroup = '';

            AXIS_CONFIG.forEach(axis => {
                if (axis.group !== currentGroup) {
                    if (currentGroup) markup += '</div>';
                    markup += `<div class="ColorPanelGroup" data-axis-group="${axis.group}">`;
                    currentGroup = axis.group;
                }
                markup += `<div class="ColorPanelAxis" data-axis-key="${axis.key}">
                               <span class="ColorPanelAxisName">${axis.name}</span>
                               <div class="ColorPanelAxisField">
                                   <div class="ColorPanelAxisTrack"></div>
                                   <span class="ColorPanelAxisMarker"></span>
                                   <input class="ColorPanelAxisRange" type="range"
                                          min="${axis.minimum}" max="${axis.maximum}" step="1"
                                          aria-label="${axis.name}">
                               </div>
                               <input class="ColorPanelAxisNumber" type="text"
                                      inputmode="numeric" maxlength="3">
                           </div>`;
            });

            return markup + '</div>';
        }
    }

    window.ColorPanel = ColorPanel;

})();
