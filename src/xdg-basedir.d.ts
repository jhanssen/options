declare module "xdg-basedir" {
    interface Xdg {
        configDirs: string[];
    }
    const xdg: Xdg;
    export default xdg;
}
