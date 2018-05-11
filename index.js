/*global require,module,process*/

const fs = require("fs");
const path = require("path");
const appPath = require("app-root-path");
const xdg = require('xdg-basedir');

function split(data)
{
    const pre = data.split("\n");
    // rejoin with lines that starts with a whitespace
    const out = [];
    let cur = "";
    for (let i = 0; i < pre.length; ++i) {
        let line = pre[i].replace(/\t/g, "  ");
        if (!line.length)
            continue;
        if (!cur.length || /\s/.test(line[0])) {
            let idx = 0;
            while (/\s/.test(line[idx]))
                ++idx;
            cur += line.substr(idx ? idx - 1 : 0);
            idx = cur.length - 1;
            while (idx >= 0 && /\s/.test(cur[idx]))
                --idx;
            if (idx < cur.length - 1)
                cur = cur.substr(0, idx + 1);
        } else if (cur.length > 0) {
            out.push(cur.trim());
            cur = line.trim();
        }
    }
    if (cur.length > 0) {
        out.push(cur.trim());
    }
    return out;
}

function realValue(v)
{
    if (typeof v !== "string")
        return v;
    const vf = parseFloat(v);
    if (!isNaN(vf))
        return vf;
    switch (v) {
    case "true":
        return true;
    case "false":
        return false;
    }
    return v;
}

class Options {
    constructor(prefix, argv) {
        this.prefix = prefix ? (prefix + "-") : "";
        this.argv = argv;

        this._readFile(prefix);
    }

    value(name) {
        // foo-bar becomes FOO_BAR as env
        if (name in this.argv)
            return this.argv[name];
        const envname = (this.prefix + name).replace(/-/g, "_").toUpperCase();
        if (envname in process.env)
            return realValue(process.env[envname]);
        return undefined;
    }

    _readFile(prefix) {
        // if we have a config file passed, read it
        let file = this.value("config-file");
        if (!file && prefix)
            file = prefix + ".conf";
        if (file) {
            const read = file => {
                let data;
                try {
                    data = fs.readFileSync(file, "utf8");
                } catch (e) {
                }
                return data;
            };

            let data;
            if (path.isAbsolute(file)) {
                data = read(file);
            } else {
                ([appPath.toString()].concat(xdg.configDirs)).forEach(root => {
                    // in case we appended with undefined
                    if (!root)
                        return;
                    if (!data)
                        data = read(path.join(root, file)) || read(path.join(root, file) + ".conf");
                });
            }
            if (typeof data === "string") {
                // entries of key=value
                const items = split(data);
                for (let i = 0; i < items.length; ++i) {
                    const item = items[i].trim();
                    if (!item.length)
                        continue;
                    if (item[0] === "#")
                        continue;
                    const eq = item.indexOf("=");
                    if (eq === -1)
                        continue;
                    const key = item.substr(0, eq).trim();
                    if (!key.length)
                        continue;
                    if (!(key in this.argv)) {
                        this.argv[key] = item.substr(eq + 1).trim();
                    }
                }
            }
        }
    }
}

const data = {};

module.exports = function(prefix, argv) {
    if (!argv)
        argv = require("minimist")(process.argv.slice(2));

    data.options = new Options(prefix, argv);
    let ret = function(name, defaultValue) {
        const val = data.options.value(name);
        if (typeof val === "undefined")
            return defaultValue;
        return val;
    };
    ret.int = function(name, defaultValue) {
        const v = parseInt(data.options.value(name));
        if (typeof v === "number" && !isNaN(v))
            return v;
        return defaultValue;
    };
    ret.float = function(name, defaultValue) {
        const v = parseFloat(data.options.value(name));
        if (typeof v === "number" && !isNaN(v))
            return v;
        return defaultValue;
    };
    ret.json = function(name, defaultValue) {
        const opt = data.options.value(name);
        if (!opt)
            return defaultValue;
        try {
            const json = JSON.parse(opt);
            return json;
        } catch (e) {
        }
        return defaultValue;
    };
    return ret;
};
