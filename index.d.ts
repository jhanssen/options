declare interface Options {
    prefix: string;
    additionalFiles?: string[];
    noApplicationPath?: boolean;
    debug?: boolean;
    configDirs?: string[];
}

export type Option = {[key: string]: Option} | number | string | boolean;

declare namespace options {
    export function int(key: string, defaultValue?: number) : number;
    export function float(key: string, defaultValue?: number) : number;
    export function json(key: string, defaultValue?: any) : any;
    const prefix: string | undefined;
}

declare function options(key: string, defaultValue?: Option) : Option;

export type OptionsFunction = typeof options;

export default function (opts: Options | string, args?: string[]) : OptionsFunction;
