// https://github.com/pixijs/pixi.js/issues/1785
require('phantomjs-polyfill');

var page = require('webpage').create();
var fs = require('fs');
var Resurrect = require('./lib/resurrect');
var compare = require('fast-json-patch').compare;
var system = require('system');

var demo,
    frames = 10,
    testUrl = 'http://localhost:9000/demo/dev.html',
    refsPath = 'tests/browser/refs',
    diffsPath = 'tests/browser/diffs';

var update = arg('--update'),
    updateAll = typeof arg('--updateAll') !== 'undefined',
    diff = arg('--diff');

var resurrect = new Resurrect({ cleanup: true }),
    created = [],
    changed = [];

var test = function(status) {
    if (status === 'fail') {
        console.log('failed to load', testUrl);
        console.log('check dev server is running!');
        console.log('use `grunt dev`');
        exit(1);
        return;
    }

    var demos = page.evaluate(function() {
        var demoSelect = document.getElementById('demo-select'),
            options = Array.prototype.slice.call(demoSelect);
        return options.map(function(o) { return o.value; });
    });

    fs.removeTree(diffsPath);

    if (diff) {
        fs.makeDirectory(diffsPath);
    }

    for (var i = 0; i < demos.length; i += 1) {
        demo = demos[i];

        var hasChanged = false,
            hasCreated = false,
            forceUpdate = update === demo || updateAll,
            worldStartPath = refsPath + '/' + demo + '/' + demo + '-0.json',
            worldEndPath = refsPath + '/' + demo + '/' + demo + '-' + frames + '.json',
            worldStartDiffPath = diffsPath + '/' + demo + '/' + demo + '-0.json',
            worldEndDiffPath = diffsPath + '/' + demo + '/' + demo + '-' + frames + '.json';

        var worldStart = page.evaluate(function(demo) {
            var engine = Matter.Demo._engine;
            Matter.Runner.stop(engine);
            if (!(demo in Matter.Demo)) {
                throw '\'' + demo + '\' is not defined in Matter.Demo';
            }
            Matter.Demo[demo]();
            return engine.world;
        }, demo);

        var worldEnd = page.evaluate(function(demo, frames) {
            var engine = Matter.Demo._engine;

            for (var j = 0; j <= frames; j += 1) {
                Matter.Events.trigger(engine, 'tick', { timestamp: engine.timing.timestamp });
                Matter.Engine.update(engine, engine.timing.delta);
                Matter.Events.trigger(engine, 'afterTick', { timestamp: engine.timing.timestamp });
            }

            return engine.world;
        }, demo, frames);

        if (fs.exists(worldStartPath)) {
            var worldStartRef = resurrect.resurrect(fs.read(worldStartPath));
            var worldStartDiff = compare(worldStartRef, worldStart);

            if (worldStartDiff.length !== 0) {
                if (diff) {
                    fs.write(worldStartDiffPath, JSON.stringify(worldStartDiff, null, 2), 'w');
                }

                if (forceUpdate) {
                    hasCreated = true;
                    fs.write(worldStartPath, resurrect.stringify(worldStart, null, 2), 'w');
                } else {
                    hasChanged = true; 
                }
            }
        } else {
            hasCreated = true;
            fs.write(worldStartPath, resurrect.stringify(worldStart, null, 2), 'w');
        }

        if (fs.exists(worldEndPath)) {
            var worldEndRef = resurrect.resurrect(fs.read(worldEndPath));
            var worldEndDiff = compare(worldEndRef, worldEnd);

            if (worldEndDiff.length !== 0) {
                if (diff) {
                    fs.write(worldEndDiffPath, JSON.stringify(worldEndDiff, null, 2), 'w');
                }

                if (forceUpdate) {
                    hasCreated = true;
                    fs.write(worldEndPath, resurrect.stringify(worldEnd, null, 2), 'w');
                } else {
                    hasChanged = true;
                }
            }
        } else {
            hasCreated = true;
            fs.write(worldEndPath, resurrect.stringify(worldEnd, null, 2), 'w');
        }

        if (hasChanged) {
            changed.push("'" + demo + "'");
            system.stdout.write('x');
        } else if (hasCreated) {
            created.push("'" + demo + "'");
            system.stdout.write('+');
        } else {
            system.stdout.write('.');
        }
    }

    if (created.length > 0) {
        console.log('\nupdated', created.join(', '));
    }

    var isOk = changed.length === 0 ? 1 : 0;

    console.log('');

    if (isOk) {
        console.log('ok');
    } else {
        console.log('\nchanges detected on:');
        console.log(changed.join(', '));
        console.log('\nreview, then --update [name] or --updateAll');
        console.log('use --diff for diff log');
    }

    exit(!isOk);
};

function exit(code) {
    // https://stackoverflow.com/questions/26608391/using-phantomjs-to-embed-all-images-of-a-webpage-produces-warnings-but-works
    setTimeout(function(){
        phantom.exit(code);
    }, 0);
}

function arg(name) {
    var index = system.args.indexOf(name);
    if (index >= 0) {
        return system.args[index + 1] || true;
    }
    return undefined;
}

page.onError = function(msg, trace) {
    setTimeout(function() {
        var msgStack = ['testing \'' + demo + '\'', msg];

        if (trace && trace.length) {
            trace.forEach(function(t) {
                msgStack.push(' -> ' + (t.file || t.sourceURL) + ': ' + t.line + (t.function ? ' (fn: ' + t.function +')' : ''));
            });
        }

        console.log(msgStack.join('\n'));
        exit(1);
    }, 0);
};


page.onResourceReceived = function(res) {
    setTimeout(function() {
        if (res.stage === 'end'
            && (res.status !== 304 && res.status !== 200 && res.status !== null)) {
            console.log('error', res.status, res.url);
            exit(1);
        }
    }, 0);
};

phantom.onError = page.onError;

page.open(testUrl, test);