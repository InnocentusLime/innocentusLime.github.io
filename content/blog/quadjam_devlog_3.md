+++
title = "Project Swarm Devlog (Entry 3)"
template = "article.html"
description = "A short note on how I simplified the building pipeline for the game"
date = 2025-11-01
draft = false
+++

## Introduction

I am making a game that should run in the browser. There are two 
deployment enivronments: `itch.io` and `GitHub Pages`. `GitHub Pages` are for freshest 
builds, while `itch.io` is for more stable builds. This way I avoid spamming `itch.io`
and creating a huge backlog of versions. Without sacrificing quick iteration.

These deployments are done by two different GitHub action workflows
with copy-pasted code. Originally it wasn't much of a problem: building was pretty
much a single run of `cargo build`. 

The game eventually got an integration with the `Tiled`[^1] editor. 
`Tiled` is a mature editor for tile-based levels. It was picked to avoid extra
bike-shedding in the "game made from scratch" project.

## The cost of tiled

The default file format `Tiled` works with is `.xml` wearing a cute tophat.
A human-readable format, that is also widely supported[^5]. 
There is even an **official** Rust library  for loading `Tiled`'s' files: `tiled-rs`[^2]!

Sadly, this convenience comes with a cost for web builds of the game:

* User's devices would have to download and parse those `.xml` files
* The builds would have to contain a full `.xml` parser

In addition to that, `Tiled`'s map files are not self-contained. When you ask
`tiled-rs` to load a map, it might turn out that this map is actually referencing
a **tileset file** - a separate file with data not contained inside the **map** file.
So, trying to load **one** file would actually result in loading **two** files.

This design may seem weird and complicated, but it actually makes a lot of sense. 
Your game levels are probably going to share a lot of tiles. Having to copy-paste 
a tileset for each level would make level designing a huge pain.

However, this means you can't load a map without its tilesets. And indeed, when you
ask `tiled-rs` to load a map, internally it immediately loads the appropirate tileset.
This means that the map loading routine will **block and wait** unless the tileset is
loaded. And since it happens **internally**, we as the user can't change this
behaviour in any way.

This implementation is mostly okay in desktop environments. Synchronious IO
is common there. But, in web/WASM environment all IO is inherently **async**. The
browser expects code to **eventually and voluntarily** stop executing, so it
can process other tasks[^6]. That means `tiled-rs` **can't** block and wait
for the tileset to load, which means my game can't either.

## The solution I

We can still keep `tiled-rs` around for Desktop as loading from map files
without requiring any extra action from the user is **convenient**. As for
the web builds - there is a quite elegant solution. See, `Tiled` maps are
already converted into some internal structure by my game as they are loaed. 
We can just serialize that internal structure while **making** maps and then 
deserialize it while **loading** them. Since it is all custom, 
we can easily control what gets loaded, how it gets loaded and in what order.

## A new problem

The path seems to be charted. Dev-builds will read directly from `Tiled` files
with all the overhead, while web-builds will read the lightweight format. 
But who will produce those `postcard` files?
The answer seems simple at first: the GitHub action responsible for 
deployment will **compile** the maps together with the game. Here is what the action
looks like:

```yaml
build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      - uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: ${{ vars.RUST_VERSION }}
          target: wasm32-unknown-unknown
          components: rustfmt
      - name: Set up cargo cache
        uses: actions/cache@v4
        continue-on-error: false
        with:
          path: |
            ~/.cargo/bin/
            ~/.cargo/registry/index/
            ~/.cargo/registry/cache/
            ~/.cargo/git/db/
            target/
          key: deploy-${{ runner.os }}-${{ vars.RUST_VERSION }}-cargo-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: deploy-${{ runner.os }}-${{ vars.RUST_VERSION }}-cargo-
      - name: Build
        run: cargo build --target wasm32-unknown-unknown --profile wasm-release --locked
      - name: Create dist dir
        run: mkdir dist
      - name: Acquire wasm build
        run: cp ./target/wasm32-unknown-unknown/wasm-release/${{ github.event.repository.name }}.wasm ./dist/game.wasm
      - name: Copy assets
        run: cp -rf ./assets ./dist/
      - name: Copy static
        run: cp ./static/* ./dist
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: ./dist
```

As you can see, it is very sad and complicated. And we are about to add even more steps!

```diff
+      - name: Build level-compiler
+        run: cargo build -p lib-level
       - name: Build
         run: cargo build --target wasm32-unknown-unknown --profile wasm-release --locked
       - name: Create dist dir
         run: mkdir dist
+      - name: Create levels dir
+        run: mkdir ./dist/levels
+      - name: Build all maps
+        run: ./target/debug/lib-level compile-dir -d ./tiled-project -o ./dist/levels
```

Recall that this job is also copy-pasted into another workflow.
This means we get even more places where something can go wrong.
But that's not all: the build process will become harder to do locally.

Local reproducability is an essential tool for making sure you do not merge broken code.
At first glance, it looks like there is no problem - we already have GitHub page
deployment. However, using that workflow to iterate on web-builds is slow and messy.
On the other hand, while creating a local version of some workflow, you always risk 
to create **2** independently broken workflows!

## The solution II

The solution is `Docker`[^4]... Not the service - the application.
To make web builds testable locally without creating a separate workflow, we can
create a `Docker` image that can just build itself anywhere we want!

```Dockerfile
# Create a "build" stage. This is where we build stuff
FROM rust:1.88.0-bookworm AS build

# Install some dependencies 
RUN <<EOF
    apt-get update
    apt-get install -y --no-install-recommends \
        libasound2-dev \
        libudev-dev \
        libwayland-dev \
        libxkbcommon-dev
    rustup target add wasm32-unknown-unknown
EOF

# Here we pull the code and build both the level-compiling tool
# and the game WASM module
ADD . /project/
RUN <<EOF
    cd /project &&\
    cargo build --locked --package lib-level &&\
    cargo build --target wasm32-unknown-unknown --profile wasm-release --locked
EOF

# /dist is the "build" directory. A place where we put all stuff.
# Copy some junk to the build directory (assets, html, js, wasm)
COPY /assets/ /dist/assets
COPY /static/* /dist
RUN cp /project/target/wasm32-unknown-unknown/wasm-release/quad-jam-2024.wasm /dist/game.wasm

# Invoke the level compiler
RUN mkdir /dist/levels && \
    /project/target/debug/lib-level \
        --assets /project/assets \
        compile-dir \
            -d /project/project-tiled \
            -o /dist/levels

# Discard all previous Docker layers and start a new stage.
FROM httpd:trixie 

# Copy all files from the build stage.
# The final result gives us a much smaller image, that has
# a preconfigured static HTTP server.
COPY --from=build /dist /usr/local/apache2/htdocs/ 
```

This leaves us with the only missing piece of the puzzle: how do we actually use
this for GitHub and itch.io builds? We can't just start an HTTP server and we can't
just send them a `Docker` image! The answer is actually just a few simple future-proof
lines, because we can build that image and then steal the ready files from it:

```yaml
- name: Build image
  run: docker build -t quad-jam .
- name: Instantiate image
  run: docker create --name quad-jam quad-jam
- name: Extract artifact
  run: docker cp quad-jam:/usr/local/apache2/htdocs/ ./dist
- uses: actions/upload-pages-artifact@v4
  with:
    path: ./dist/
```

[^1]: [Tiled editor](https://www.mapeditor.org/)
[^5]: Fun fact: `Tiled` uses `.tsx` extension for its tileset files.
      Because of that, my poor VsCode keeps thinking that they belong 
      to some React project. Unsurprisingly, it consistently fails to
      parse them.
[^2]: [Tiled-rs crate](https://docs.rs/tiled/latest/tiled/)
[^6]: [How your browser runs JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model)
[^4]: [Docker](https://www.docker.com/)