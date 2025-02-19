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

# The extra API

To fascilitate the mobile device support, the following functions would be needed: getting the device orientations and checking if the current device is a mobile device in the first place. The orientation checking[^2] is needed to prompt the user to rotate their mobile device (explicitly asking the device to enter a certain orientation is not baseline API at the moment[^3]). Detecting if the device is a mobile device or not is not an existing API either. However, it is possible to figure this out by checking the user agent string[^4]

```js,linenos
function app_is_on_mobile() {
    let check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
        return check;
}

function app_get_orientation() {
    switch (screen.orientation.type) {
    case "landscape-primary":
        return 0;
    case "landscape-secondary":
        return 180;
    case "portrait-secondary":
        return -90;
    case "portrait-primary":
        return 90;
    default:
        return 0;
    }
}
```

With this in-place, the functions were imported into the Rust code for later calling as follows

```rust,linenos
extern "C" {
    pub fn app_is_on_mobile() -> bool;
    pub fn app_get_orientation() -> f32;
}
```

[^1]: [WebAssmebly module instantiation API](https://developer.mozilla.org/en-US/docs/WebAssembly/Reference/JavaScript_interface/instantiate_static)
[^2]: [JS orientation API](https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation)
[^3]: [JS orientation locking API](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock)
[^4]: [A hacky regex from StackOverflow](https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser)