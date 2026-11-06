// 只在 release 的 Windows 构建里隐藏控制台窗口；其他平台这个属性不生效
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pomodoro_lib::run()
}
