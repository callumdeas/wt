import pc from "picocolors";

export function error(msg: string): void {
    console.error(pc.red(`✗ ${msg}`));
}

export function success(msg: string): void {
    console.log(pc.green(`✓ ${msg}`));
}

export function warn(msg: string): void {
    console.log(pc.yellow(`⚠ ${msg}`));
}

export function info(msg: string): void {
    console.log(pc.cyan(msg));
}

export function dim(msg: string): void {
    console.log(pc.dim(msg));
}
