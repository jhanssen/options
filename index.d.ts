declare interface Options {
    prefix: string;
    additionalFiles?: string[];
    noApplicationPath?: boolean;
    debug?: boolean;
    configDirs?: string[];
}

declare type Option = {[key: string]: Option} | number | string | boolean;

declare namespace options {
    export function int(key: string, defaultValue?: number) : number;
    export function float(key: string, defaultValue?: number) : number;
    export function json(key: string, defaultValue?: any) : any;
}

declare function options(key: string, defaultValue?: Option) : Option;

export default function (opts: Options | string, args?: string[]) : typeof options;
