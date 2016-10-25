/*
Copyright (c) 2012 Brett Dixon

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in 
the Software without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the 
Software, and to permit persons to whom the Software is furnished to do so, 
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all 
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS 
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR 
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER 
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION 
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


Frog.Viewer = new Class({
    Implements: Events,
    LIMIT: 100,
    initialize: function() {
        this.origin = {x: 0, y: 0};
        this.xform = Matrix.I(3);
        this.main = Matrix.I(3);
        this.scaleValue = 1.0;
        this.axis = 'x';

        this.objects = [];
        this.current = 0;
        this.isMouseDown = false;
        this.isOpen = false;

        this.element = new Element('div', {id: 'frog_viewer'}).inject(document.body);
        this.canvas = new Element('canvas', {width: window.getWidth(), height: window.getHeight()}).inject(this.element);
        this.video = new Element('div').inject(this.element);
        this.videoEl = new Element('video', {'id': 'frog_video_player', 'class': 'video-js'}).inject(this.video);
        this.img = new Element('img', {width: window.getWidth(), height: window.getHeight()}).inject(this.element, 'top');

        this.ctx = this.canvas.getContext('2d');
        this.image = new Image();
        this.image.onload = this._loadCallback.bind(this);
        this.image.onprogress = this._progressCallback.bind(this);

        this.events = {
            up: this.up.bind(this),
            down: this.down.bind(this),
            move: this.move.bind(this),
            zoom: this.zoom.bind(this),
            resize: this.resize.bind(this)
        };

        this.keyboard = new Keyboard({
            events: {
                'left': function(e) { e.stop(); this.prev(); }.bind(this),
                'right': function(e) { e.stop(); this.next(); }.bind(this),
                'f': function(e) { e.stop(); this.fitToWindow(); }.bind(this),
                'z': function(e) { e.stop(); this.original(); }.bind(this),
                'esc': function(e) { 
                    e.stop(); this.hide(); 
                }.bind(this)
            }
        });
        this.editKeyboard = new Keyboard();

        this.build();
        this.shelf = new Frog.Viewer.Shelf();
        this.shelf.inject(this.element);
        this.shelf.addEvent('click', function(idx, obj) {
            this.setIndex(idx);
        }.bind(this));
    },
    toElement: function() {
        return this.element;
    },
    up: function(e) {
        this.isMouseDown = false;
        this.main = this.xform;
    },
    down: function(e) {
        e.stop();
        if (e.event.button == 0) {
            this.isMouseDown = true;
            this.origin.x = e.client.x;
            this.origin.y = e.client.y;
            this.shelf.hide();
        }
        this._submitEdits();
    },
    move: function(e) {
        if (this.isMouseDown) {
            var x = e.client.x - this.origin.x;
            var y = e.client.y - this.origin.y;

            if (e.shift && this.axis === 'x') {
                y = 0;
            }
            if (e.shift && this.axis === 'y') {
                x = 0;
            }

            this.xform = Matrix.I(3).x(this.main);

            this.translate(x,y);

            this.render();
        }
    },
    zoom: function(e) {
        e.stop();
        var scaleValue = 1.0;
        if (e.wheel > 0) {
            scaleValue += 0.05;
        }
        else {
            scaleValue -= 0.05;
        }
        var x = e.client.x;
        var y = e.client.y;
        this.xform = Matrix.I(3).x(this.main);
        this.translate(-x, -y);
        this.scale(scaleValue, scaleValue);
        this.translate(x, y);
        this.main = this.xform;
        this.render();
    },
    build: function() {
        var info = new Element('div', {id: 'frog_viewer_info'});
        this.title = new Element('h1').inject(info);
        this.description = new Element('pre').inject(info);
        this.author = new Element('i').inject(info);
        this.date = new Element('i').inject(info);

        var controls = new Element('div', {id: 'frog_viewer_controls'});
        var buttons = new Element('ul').inject(controls);
        this.bPrev = new Element('li', {'class': 'frog-prev'}).inject(buttons);
        this.bNext = new Element('li', {'class': 'frog-next'}).inject(buttons);
        this.bOriginal = new Element('li', {'class': 'frog-original'}).inject(buttons);
        this.bWindow = new Element('li', {'class': 'frog-window'}).inject(buttons);
        this.bDownload = new Element('li', {'class': 'frog-download'}).inject(buttons);

        this.countLabel = new Element('div', {'class': 'image-count', 'text': '1/1'}).inject(controls);

        this.bPrev.addEvent('click', this.prev.bind(this));
        this.bNext.addEvent('click', this.next.bind(this));
        this.bOriginal.addEvent('click', this.original.bind(this));
        this.bWindow.addEvent('click', this.fitToWindow.bind(this));
        this.bDownload.addEvent('click', this.download.bind(this));

        info.inject(this.element);
        controls.inject(this.element);

        this.bClose = new Element('div', {
            'class': 'frog-viewer-close',
            events: {
                click: this.hide.bind(this)
            }
        }).inject(controls);
    },
    clear: function() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },
    render: function() {
        this.clear();

        this.ctx.drawImage(
            this.image, 
            parseInt(this.xform.elements[2][0]),
            parseInt(this.xform.elements[2][1]),
            parseInt(this.xform.elements[0][0]),
            parseInt(this.xform.elements[1][1])
        );
    },
    center: function(scale) {
        scale = scale || 1.0;

        this.xform = $M([
            [this.image.width,0,0],
            [0,this.image.height,0],
            [0,0,1]
        ]);
        this.scale(scale, scale);
        var x = window.getWidth() / 2 - this.xform.elements[0][0] / 2;
        var y = window.getHeight() / 2 - this.xform.elements[1][1] / 2;
        this.translate(x, y);

        this.main = this.xform;

        this.render();

    },
    next: function() {
        var idx = this.current + 1;
        idx = (idx > this.objects.length - 1) ? 0 : idx;

        this.setIndex(idx);
    },
    prev: function() {
        var idx = this.current - 1;
        idx = (idx < 0) ? this.objects.length - 1 : idx;

        this.setIndex(idx);
    },
    original: function() {
        this.center();

        var vid = this.objects[this.current];
        var padTop = window.getHeight() / 2 - vid.height / 2;
        this.video.firstChild.setStyle('margin', parseInt(padTop) + 'px auto');

        this.video.firstChild.setStyles({
            width: vid.width,
            height: vid.height
        })
    },
    fitToWindow: function() {
        var padding = 40;
        var dim = Frog.util.fitToRect(window.getWidth() - padding, window.getHeight() - padding, this.image.width, this.image.height);

        // -- Video
        if (this.video.isVisible() && this.player) {
            var vid = this.objects[this.current];
            var dim = Frog.util.fitToRect(window.getWidth() - padding, window.getHeight() - padding, vid.width, vid.height);
            var scale = dim.width / vid.width;
            var padTop = window.getHeight() / 2 - (vid.height * scale) / 2;
            this.video.firstChild.setStyle('margin', parseInt(padTop) + 'px auto');
            this.video.firstChild.setStyle('width', vid.width * scale);
            this.video.firstChild.setStyle('height', vid.height * scale);
        }
        else {
            var scale = dim.width / this.image.width;
            scale = (scale > 1.0) ? 1.0 : scale;
        }
        

        this.center(scale);
    },
    download: function() {
        var guid = this.objects[this.current].guid;
        location.href = '/frog/download?guids=' + guid;
    },
    translate: function(x, y) {
        var m1, m2;

        m1 = $M([
            [1,0,0],
            [0,1,0],
            [x,y,1]
        ]);

        var m2 = this.xform.x(m1);
        this.xform = m2.dup();
    },
    scale: function(x, y) {
        var m1, m2;

        m1 = $M([
            [x,0,0],
            [0,y,0],
            [0,0,1]
        ]);

        m2 = this.xform.x(m1);
        this.xform = m2.dup();
    },
    resize: function(e) {
        this.canvas.width = window.getWidth();
        this.canvas.height = window.getHeight();
        this.img.width = window.getWidth();
        this.img.height = window.getHeight();

        this.shelf.hide();

        this.fitToWindow();
    },
    setImage: function(img) {
        this.video.hide();
        this.canvas.show();
        this.img.show();
        
        this.videoEl.empty();
        this.image.src = img;
        if (this.image.complete) {
            this._loadCallback();
        }
    },
    setVideo: function(vid) {
        this.canvas.hide();
        this.img.hide();
        this.video.show();
        this.videoEl.empty();

        this.videoEl.width = vid.width;
        this.videoEl.height = vid.height;
        this.videoEl.setProperties({
            poster: vid.thumbnail,
            autoplay: 'autoplay',
            loop: 'loop',
            controls: 'controls',
            src: vid.video
        });

        new Element('source', {
            src: vid.video,
            type: 'video/mp4'
        }).inject(this.videoEl);
        this.videoEl.load();
        this.videoEl.play();

        if (!this.player) {
            this.player = videojs('frog_video_player');
        }

        this.fitToWindow();
    },
    setImages: function(images, id) {
        if (typeof(id) === 'undefined') {
            id = this.current;
        }
        this.objects = images;
        this.setIndex(id.toInt());
        this.shelf.populate(this.objects);

        this.countLabel.set('text', id + '/' + images.length);
        
        var data = Frog.util.hashData();
        if (images.length > this.LIMIT) {
            data.viewer = [images[id].guid];
        }
        else {
            data.viewer = this.objects.map(function(item) { return item.guid; });
        }
        location.hash = JSON.stringify(data);
    },
    setIndex: function(idx) {
        idx = idx.toInt();
        this.current = idx;
        var obj = this.objects[idx];
        var url = location.protocol + location.host;
        if (obj.guid.charAt(0) === '1') {
            this.videoEl.pause();
            this.img.removeAttribute('style');
            this.setImage(obj.image);
        }
        else {
            this.img.setStyle('display', 'none');
            this.setVideo(obj);
        }

        this.title.set('text', obj.title);
        this.author.set('text', obj.author.username);
        this.date.set('text', new Date(obj.created).format('%Y.%M.%d'));
        var description = obj.description;
        if (this.objects[this.current].author.username === Frog.user.username && !description) {
            description = '<description>';
        }
        this.description.set('text', description);
        
        this.countLabel.set('text', (idx + 1) + '/' + this.objects.length);

        this.title.addEvent('dblclick', function (event) {
            if (this.objects[this.current].author.username !== Frog.user.username) {
                return;
            }
            event.stop();
            var el = new Element('input', {'type': 'text'}).inject(this.element);
            var size = this.title.getSize();
            el.setStyle('background-color', '#' + Frog.Prefs.backgroundColor);
            el.setStyle('width', size.x + 12);
            el.setStyle('height', size.y + 12);
            el.setPosition(this.title.getPosition());
            el.value = this.title.get('text');
            el.select();
            el.addEvent('blur', this._submitEdits.bind(this));
            el.addEvent('keyup', function(event) {
                if (event.code === 13) {
                    this._submitEdits();
                }
            }.bind(this));
            this.editKeyboard.activate();
        }.bind(this));
        this.description.addEvent('dblclick', function (event) {
            if (this.objects[this.current].author.username !== Frog.user.username) {
                return;
            }
            event.stop();
            var el = new Element('textarea').inject(this.element);
            var size = this.description.getSize();
            el.setStyle('background-color', '#' + Frog.Prefs.backgroundColor);
            el.setStyle('width', size.x + 12);
            el.setStyle('height', size.y + 12);
            el.setPosition(this.description.getPosition());
            el.value = this.description.get('text');
            el.select();
            el.addEvent('blur', this._submitEdits.bind(this));
            this.editKeyboard.activate();
        }.bind(this));
    },
    _loadCallback: function() {
        this.xform = this.main = $M([
            [this.objects[this.current].width,0,0],
            [0,this.objects[this.current].height,0],
            [0,0,1]
        ]);
        this.img.src = this.image.src;
        this.axis = (this.image.width > this.image.height) ? 'x' : 'y';
        this.render();
        this.fitToWindow();
    },
    _progressCallback: function() {
        console.log(arguments);
    },
    _submitEdits: function() {
        this.editKeyboard.relinquish();
        var title = this.element.getElement('input[type="text"]');
        var desc = this.element.getElement('textarea');
        if (desc) {
            if (this.description.get('text') !== desc.value) {
                new Request.JSON({
                    url: '/frog/piece/' + this.objects[this.current].guid + '/',
                    emulation: false
                }).PUT({description: desc.value});
                this.description.set('text', desc.value);
                this.objects[this.current].description = desc.value;
            }
            desc.destroy();
        }
        if (title) {
            if (this.title.get('text') !== title.value) {
                new Request.JSON({
                    url: '/frog/piece/' + this.objects[this.current].guid + '/',
                    emulation: false
                }).PUT({title: title.value});
                this.title.set('text', title.value);
                this.objects[this.current].title = title.value;
            }
            title.destroy();
        }
    },
    show: function() {
        this.clear();
        this.image.src = Frog.loading.src;
        this.element.show();

        this.img.addEvent('mousedown', this.events.down);
        window.addEvent('mouseup', this.events.up);
        window.addEvent('mousemove', this.events.move);
        window.addEvent('mousewheel', this.events.zoom);
        window.addEvent('resize', this.events.resize);
        document.body.addClass('noscroll');
        document.body.addClass('noselect');
        this.element.setStyle('background-color', '#' + Frog.Prefs.backgroundColor);

        this.keyboard.activate();
        this.fireEvent('onShow', [this]);
        this.isOpen = true;
        this.resize();
    },
    hide: function() {
        this.element.hide();

        this.img.removeEvent('mousedown', this.events.down);
        window.removeEvent('mouseup', this.events.up);
        window.removeEvent('mousemove', this.events.move);
        window.removeEvent('mousewheel', this.events.zoom);
        document.body.removeClass('noscroll');
        document.body.removeClass('noselect');

        this.keyboard.relinquish();
        this.editKeyboard.relinquish();

        var data = Frog.util.hashData();
        delete data.viewer;
        location.hash = JSON.stringify(data);

        this.videoEl.pause();
        this.fireEvent('onHide', [this]);
        this.isOpen = false;
        this.resize();
    }
});

Frog.Viewer.Shelf = new Class({
    Implements: Events,
    initialize: function() {
        var self = this;
        this.shelf = new Element('div', {id: 'frog_shelf'});
        this.shelfContainer = new Element('div', {id: 'frog_shelf_thumbnails'}).inject(this.shelf);
        
        var shelfTrigger = new Element('div', {
            id: 'frog_shelf_trigger',
            events: {
                mouseover: function(e) {
                    e.stop();
                    self.show();
                }
            }
        }).inject(this.shelf);

        this.shelf.setStyle('right', window.getWidth() * -1);
    },
    inject: function(el) {
        this.shelf.inject(el);
    },
    populate: function(objects) {
        var self = this;
        this.shelfContainer.empty();
        // -- Populate with thumbnails
        var limit = 15;
        if (objects.length < limit) {
            this.shelf.show();
            objects.each(function(item, idx) {
                new Element('img', {
                    src: item.thumbnail,
                    height: 48,
                    events: {
                        click: function(e) {
                            e.stop();
                            self.fireEvent('onClick', [idx, item]);
                        }
                    }
                }).inject(self.shelfContainer);
            })
        }
        else {
            this.shelf.hide();
        }
        this.shelf.firstChild.setStyle('width', window.getWidth());
    },
    show: function() {
        this.shelf.tween('right', 0);
    },
    hide: function() {
        this.shelf.tween('right', window.getWidth() * -1);
    },
    toElement: function() {
        return this.shelf;
    }
})
