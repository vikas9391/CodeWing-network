use substrate_build_script_utils::{generate_cargo_keys, rerun_if_git_head_changed};

fn main() {
    // Generates environment variables used by Substrate (like WASM builder flags)
    generate_cargo_keys();

    // Re-run the build script when the git HEAD changes
    rerun_if_git_head_changed();
}
