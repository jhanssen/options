import fs from "fs";
import path from "path";
import appPath from "app-root-path";
import xdg from "xdg-basedir";
import minimist from "minimist";

export interface OptionsOptions {
    prefix: string;
    additionalFiles?: string[];
    noApplicationPath?: boolean;
    debug?: boolean;
    configDirs?: string[];
}

export type Value = string | number | boolean | { [key: string]: Value };

function split(data: string): string[] {
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

function realValue(v: Value | undefined): Value | undefined {
    if (typeof v !== "string")
        return v;
    if (/^[-0-9.]+$/.exec(v)) {
        const vf = parseFloat(v);
        if (!isNaN(vf))
            return vf;
    }
    switch (v) {
    case "true":
        return true;
    case "false":
        return false;
    }
    return v;
}

const enum OptionsReadResult {
    Failed,
    Success,
    Seen,
}

class Engine {
    private readonly argv: minimist.ParsedArgs;
    private readonly prefix: string;
    private readonly additionalFiles: string[];
    private readonly applicationPath: string;
    private readonly debug: boolean;
    private readonly options: Record<string, Value>;
    private readonly configDirs: string | string[];

    constructor(options: OptionsOptions, argv: minimist.ParsedArgs) {
        this.argv = Object.assign({}, argv);
        this.prefix = options.prefix;
        this.additionalFiles = options.additionalFiles || [];
        this.applicationPath = options.noApplicationPath ? "" : appPath.toString();
        this.debug = options.debug ?? false;
        this.options = {};
        this.configDirs = this.argv["config-dir"] ||  options.configDirs || xdg.configDirs;
        this._read();
    }

    value(name: string): Value | undefined {
        // foo-bar becomes FOO_BAR as env
        if (name in this.argv) {
            return this.argv[name];
        }
        const envname = (this.prefix + "_" + name).replace(/-/g, "_").toUpperCase();
        if (envname in process.env) {
            return realValue(process.env[envname]);
        }

        if (name in this.options) {
            return this.options[name];
        }
        return undefined;
    }

    string(name: string): string | undefined {
        const ret = this.value(name);
        if (ret === undefined) {
            return undefined;
        }
        return String(ret);
    }

    private _homedir(): string | undefined {
        let home = process.env.home;
        if (home) {
            return path.join(home, ".config");
        }
        return undefined;
    }

    private _log(...args: unknown[]): void {
        if (this.debug)
            console.log(...args);
    }

    private _read() {
        // if we have a config file passed, read it
        let file = this.string("config-file");
        if (!file && this.prefix)
            file = this.prefix + ".conf";
        if (!file)
            return;

        let data: { file: string, contents: string}[] = [];
        let seen = new Set();
        const read = (file: string): OptionsReadResult => {
            if (seen.has(file))
                return OptionsReadResult.Seen;
            seen.add(file);
            try {
                const contents = fs.readFileSync(file, "utf8");
                this._log(`Loaded ${contents.length} bytes from ${file}`);

                if (contents) {
                    data.push({ file, contents });
                    return OptionsReadResult.Success;
                }
            } catch (e) {
                this._log(`Failed to load ${file}`);
            }
            return OptionsReadResult.Failed;
        };

        // console.log("about to read file", file, "additionalFiles", this.additionalFiles, "configDirs", this.configDirs, "applicationPath", this.applicationPath, "homedir", this._homedir());
        if (path.isAbsolute(file)) {
            read(file);
        } else {
            this.additionalFiles.forEach(file => {
                if (path.isAbsolute(file) && read(file) == OptionsReadResult.Failed) {
                    read(file + ".conf");
                }
            });
            ([this.applicationPath, this._homedir()].concat(this.configDirs)).forEach(root => {
                // in case we appended with undefined
                if (!root) {
                    return;
                }

                this.additionalFiles.forEach(additional => {
                    if (!path.isAbsolute(additional)) {
                        let file = path.join(root, additional);
                        if (read(file) == OptionsReadResult.Failed)
                            read(file + ".conf");
                    }
                });

                let filePath = path.join(root, file!);
                if (read(filePath) == OptionsReadResult.Failed) {
                    read(filePath + ".conf");
                }
            });
        }
        for (let i = data.length - 1; i >= 0; --i) {
            let str = data[i].contents;
            if (!str) {
                continue;
            }

            try {
                let obj = JSON.parse(str);
                for (let key in obj) {
                    this._log(`Assigning ${JSON.stringify(obj[key])} over ${JSON.stringify(this.options[key])} for ${key} from ${data[i].file} (JSON)`);
                    this.options[key] = obj[key];
                }
            } catch (err) {
                const items = split(str);
                for (let j = 0; j < items.length; ++j) {
                    const item = items[j].trim();
                    if (!item.length)
                        continue;
                    if (item[0] === "#")
                        continue;
                    const eq = item.indexOf("=");
                    if (eq === -1) {
                        this._log("Couldn't find =", item);
                        continue;
                    }
                    const key = item.substring(0, eq).trim();
                    if (!key.length) {
                        this._log("empty key", item);
                        continue;
                    }
                    const value = item.substring(eq + 1).trim();
                    this._log(`Assigning ${value} over ${this.options[key]} for ${key} from ${data[i].file} (INI)`);
                    this.options[key] = value;
                }
            }
        }
    }
}

export interface Options {
    readonly prefix: string;

    (name: string): Value | undefined;
    (name: string, defaultValue: Value): Value;

    float(name: string): number | undefined;
    float(name: string, defaultValue: number): number;

    int(name: string): number | undefined;
    int(name: string, defaultValue: number): number;

    json(name: string, defaultValue?: unknown): unknown;

    string(name: string): string | undefined;
    string(name: string, defaultValue: string): string;
}

export default function(optionsOptions: OptionsOptions | string, argv?: minimist.ParsedArgs): Options {
    if (!argv) {
        argv = minimist(process.argv.slice(2));
    }

    if (!(optionsOptions instanceof Object)) {
        optionsOptions = { prefix: optionsOptions || "" };
    }

    const engine = new Engine(optionsOptions, argv);

    function value(name: string): Value | undefined;
    function value(name: string, defaultValue: Value): Value;
    function value(name: string, defaultValue?: Value): Value | undefined {
        const val = engine.value(name);
        if (val === undefined)
            return defaultValue;
        return val;
    }

    function float(name: string): number | undefined;
    function float(name: string, defaultValue: number): number;
    function float(name: string, defaultValue?: number): number | undefined {
        const v = parseFloat(engine.string(name) || "");
        if (typeof v === "number" && !isNaN(v))
            return v;
        return defaultValue;
    }

    function int(name: string): number | undefined;
    function int(name: string, defaultValue: number): number;
    function int(name: string, defaultValue?: number): number | undefined {
        const v = parseInt(engine.string(name) || "");
        if (typeof v === "number" && !isNaN(v))
            return v;
        return defaultValue;
    }

    function json(name: string, defaultValue?: unknown): unknown {
        const opt = engine.value(name);
        if (opt === undefined)
            return defaultValue;
        if (typeof opt !== "string")
            return opt;
        try {
            const json = JSON.parse(opt);
            return json;
        } catch (e) {
        }
        return defaultValue;
    }

    function string(name: string): string | undefined;
    function string(name: string, defaultValue: string): string;
    function string(name: string, defaultValue?: string): string | undefined {
        return engine.string(name) ?? defaultValue;
    }

    return Object.assign(value, {
        prefix: optionsOptions.prefix,
        float,
        int,
        json,
        string,
    });
};
