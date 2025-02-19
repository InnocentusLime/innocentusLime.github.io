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