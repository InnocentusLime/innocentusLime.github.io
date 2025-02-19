+++
title = "Simple Arconoid That Runs On Mobile"
template = "article.html"
description = "Macroquad is a very nice variable for writing games! But have you ever tried writing a game in it that works both on Desktop and mobile... In a browser?"
date = 2025-02-12
draft = false
+++

# Introduction

`macroquad` is a library for developing games. It has a remarkably simple API and a decent cross-platform support. There is an [amazing tutorial](https://mq.agical.se/) on how to write the game with it. In addition to this, there is an [excellent section](https://mq.agical.se/release-web.html) on shipping your game in `WebAssembly`. Is it possible to make a `macroquad` application that is compiled into `WebAssembly`, that works both on PC and mobile?

If you browse [the examples](https://macroquad.rs/examples/), hosted on the macroquad website -- you will find that they work on `WebAssembly` supporting mobile devices without any problems at a quite comfortable FPS. Some examples that do not require keyboard input can even be interracted with. However, these are just application examples. This blogpost is about `Boring Arcanoid` -- a simple arcanoid clone written with `macroquad` that can be played **both** on phones and PCs.

The application is a single standalone `WebAssembly` module, that detects the platform it is run on at runtime and adjusts the conrols and ui accordingly.

# Miniquad plugin API

At the current moment a lot of browser API is not available in `WebAssembly`. This is circumvented by providing what is needed with "import objects"[^1]. In fact `macroquad` and `miniquad` do just that to import the WebGL API functions.

However, if we were to just use that import object to sneak in the OpenGL functions -- `miniquad` and `macroquad` applications would be quite hard to extend. Crates like `quad_snd` would not be possible. For this reason `miniquad` has a plugin API, which is described in detail on `macroquad` website [here](https://macroquad.rs/articles/wasm/). The gist of it is as follows

```js,linenos
miniquad_add_plugin({
    register_plugin: reg_function,
    on_init: init_func,
    name: "Plugin name",
    version: VERSION_NUM
});
```

The exported API should be put into the import object with `reg_function` and all the plugin state (on the JS side) should initialised with `init_func`. With this API, I was able to add some functions that would allow me to implement the cross-platform arcanoid.

[^1]: WebAssmebly module instantiation API https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiate_static