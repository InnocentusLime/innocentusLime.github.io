+++
title = "Refactoring Miniquad: About Buffers"
template = "article.html"
description = "Reworking a deep dependency of my game"
date = 2025-11-29
draft = false
+++

## Introduction

I am developing a video game. Over the course of development, I have created quite
a bit of code that would be nice to re-use. One of the main dependencies of the game
is a library called `macroquad`[^1]. As I used that library, I noticed several
shortcomings about it. First of all, several features were buggy or had questionable
API. Second of all, it has a lot of code that will never be useful in my projects
and will never see the light of day, as it doesn't seem to be developed anyomore.

As I tried to patch some of the oddities or use the more low-level parts of miniquad,
it turned out that the problems come from much lower parts of the library. These
parts, unfortunately, too required a lot of rework. This entry is a part of the multipart
series where I will be reworking the main dependency of macroquad: **miniquad**[^2].

## Introducing Miniquad

So what is **miniquad**? It is, for the most part, a cross-platform multimedia library.
Not unlike `SDL`[^3] or `SFML`[^4]. Although, a more accurate example of miniquad is would
be `Sokol`[^5] - a low-level graphics C library. As summarized by the description on the
`docs.rs` page for miniquad:

> Miniquad aims to provide a graphics abstraction that works the same way on any platform with a GPU, being as light weight as possible while covering as many machines as possible.

Miniquad's API is directly inspired by Sokol. Here are the examples of drawing a frame
with just a triangle in both APIs:

```rust
// Miniquad pipeline creation
let pipeline = ctx.new_pipeline(
    &[BufferLayout::default()],
    &[
        VertexAttribute::new("in_pos", VertexFormat::Float2),
        VertexAttribute::new("in_color", VertexFormat::Float4),
    ],
    shader,
    PipelineParams::default(),
);

// Miniquad frame drawing
self.ctx.begin_default_pass(Default::default());
self.ctx.apply_pipeline(&self.pipeline);
self.ctx.apply_bindings(&self.bindings);
self.ctx.draw(0, 3, 1);
self.ctx.end_render_pass();
self.ctx.commit_frame();
```

```c
// Sokol pipeline creation
state.pip = sg_make_pipeline(&(sg_pipeline_desc){
    .shader = shd,
    .layout = {
        .attrs = {
            [ATTR_triangle_position].format = SG_VERTEXFORMAT_FLOAT3,
            [ATTR_triangle_color0].format = SG_VERTEXFORMAT_FLOAT4
        }
    },
    .label = "triangle-pipeline"
});

// Sokol frame drawing
sg_begin_pass(&(sg_pass){ .action = state.pass_action, .swapchain = sglue_swapchain() });
sg_apply_pipeline(state.pip);
sg_apply_bindings(&state.bind);
sg_draw(0, 3, 1);
sg_end_pass();
sg_commit();
```

## Why so un-Rusty?

The design choice may raise a few eyebrows. Miniquad is a Rust library. Why would it
borrow so much from a C design? Both of its main design pillars feel like odd-balls in
the world of Rust. 

First, we have the `begin`-`end` API. Personally, I don't have much against that style,
except that maybe I **personally** find it a bit harder to read. But is that really the
best thing we can do in Rust? As far as I know, it is a quite common pattern to have
things like this:

```rust
do_my_thing_in_environment(|| {
    /* Your thing */
})
```

Secondly, miniquad does a lot of verbose bike-shedding. In order to achive the
light-weight goal, it has a lot of OS-specific code inserted right into it. Miniquad
talks directly to the Operating System, manages context creation and sets up the
OpenGL functions. Needless to say, miniquad has portability bugs. One of the most
frustrating ones is that it handles keyboard input differently: on `Windows` it reads
**physical** keys, while on `X11 Linux` it reads **virtual** keys.

Thirdly, we have complete lack of RAII. Now, there is a completely valid discussion to
have about applicability of RAII as an approach and that it may not even work in languages
like C[^6]. You may argue that `defer` is the proper way for cleaning up resources and
things like that. But this is a **Rust** library. **Rust** is a language where the `Drop`
trait exists and types like `File` and `Mutex` follow the RAII semantics. Instead,
miniquad works with untyped handles. 

## Confusing Buffer API

Here is where we get to the star of this entry - the buffer API. Here I will show you,
that it is not only confusing, but also somewhat cumbersome. 
For example, consider this pipeline creation code. Let's try to analyze it

```rust
// We create a pipeline
let pipeline = ctx.new_pipeline(
    // Some "default" BufferLayout value. Seems irrelevant?
    &[BufferLayout::default()],
    // The pipeline takes two attribute inputs: `in_pos` and `in_color`
    &[
        VertexAttribute::new("in_pos", VertexFormat::Float2),
        VertexAttribute::new("in_color", VertexFormat::Float4),
    ],
    // Shader source code
    shader,
    // Default values for parameters
    PipelineParams::default(),
);
```

If you are experiencing this library for the first time, you unfortunately would 
get stuck, because neither `new_pipeline`, `BufferLayout` or `VertexAttribute` 
properly explain what on earth is going on. Let's have a look at `VertexAttribute::new()`

```rust
impl VertexAttribute {
    pub const fn new(name: &'static str, format: VertexFormat) -> VertexAttribute {
        Self::with_buffer(name, format, 0)
    }

    pub const fn with_buffer(
        name: &'static str,
        format: VertexFormat,
        buffer_index: usize,
    ) -> VertexAttribute {
        VertexAttribute {
            name,
            format,
            buffer_index,
            gl_pass_as_float: true,
        }
    }
}
```

That means that our `VertexAttribute::new("in_pos", VertexFormat::Float2)` call
creates `VertexAttribute` struct initialized as follows:

```rust
VertexAttribute {
    name: "in_pos",
    format: VertexFormat::Float2,
    buffer_index: 0,
    gl_pass_as_float: true,
}
```

But what's `buffer_index`? This is **not** `BufferId` returned by `create_buffer` API.
It is in fact the index into the array that we provided as the first argument! So, 
attributes "point" at "buffer layouts" and get some information from them:

```
BufferLayout0       BufferLayout1
      ^                   ^
      │                   │
┌─────┴─────┐       ┌─────┴─────┐
|           |       |           |
Attr1     Attr2    Attr3       Attr4
```

But those are just "Buffer layout" not an **actual** buffer... Well, that's because you
are supposed to bind the buffers later. `BufferLayout` declares something like a buffer
slot/input for the pipeline. Later, as you invoke the pipeline you tell it what
"layout" corresponds to what buffer. 

This explanation is complicated, but it can gets even more complicated. Let's come back
to that call:

```rust
// We create a pipeline that takes ONE buffer, that buffer
// contains data about "position" and "color".
let pipeline = ctx.new_pipeline(
    &[
        // Buffer 1 "Slot"
        BufferLayout::default(),
    ],
    &[
        // Buffer 1 has `in_pos` which is a vector of 2 floats
        VertexAttribute::new("in_pos", VertexFormat::Float2),
        // Buffer 2 has `in_color` which is a vector of 4 floats
        VertexAttribute::new("in_color", VertexFormat::Float4),
    ],
    /* other args omitted */
);
```

The question is: *how does miniquad now the offsets of `in_pos` and `in_color` inside
the buffer we are later going to provide*? Take a good pause and think about it.

If your answer is a list of the following bullet points:

> * `miniquad` implicitly assumes that `in_pos` is at offset zero
> * `miniquad` implicitly assumes that `in_color` is right after `in_pos`

You would be correct! The order of `VertexAttribute`s actually matters and `miniquad`
assumes that your buffer is tightly packed.

## There's more (dear god)

Let's take a look at the type that is backing up the buffer implementation. Not
the `BufferId`, of course. That one is just a handle. Inside `miniquad` source
code there is a type called "Buffer"

```rust
// Code taken verbatim from the source
#[derive(Clone, Copy, Debug)]
struct Buffer {
    gl_buf: GLuint,
    buffer_type: BufferType,
    size: usize,
    // Dimension of the indices for this buffer,
    // used only as a type argument for glDrawElements and can be
    // 1, 2 or 4
    index_type: Option<u32>,
}
```

Let's go over the fields. `size` is the first obvious one we can throw out of the
picture as it is just a field used to memorize what size the buffer is. `gl_buf`
is the second obvious candidate as it is just a raw handle for the underlying 
OpenGL object. `buffer_type` is a two-valued enum that is either `VertexBuffer`
or `IndexBuffer` and is mostly self-explanatory (especially if you know what
"vertex buffers" and "index buffers"[^7] are). 

This leaves us with `index_type`, which is an **optional 32-bit unsigned integer**.
The comment goes into some detail about the nature of this number, but actually does
very little to explain on earth it's actually doing.

Firstly, `index_type` is the piece of data only relevant for **index buffers**.
Which is why, if you read the code very carefully, it is set to `None` for all 
**vertex buffers**. It is still a mystery why the author chose `Option<u32>` 
instead of simply setting `index_type` to `0` for vertex buffers.

Secondly, the comment about "dimension of the indices" is just to throw you off,
as it has nothing to do with how this field is used. Let's have a look at how this 
value is actually used internally

```rust
// Careful readers may also notice, that we are call
// glDrawElementsINSTANCED here, not just glDrawElements.
// Luckily, this difference is irrelevant here.
glDrawElementsInstanced(
    primitive_type,
    num_elements,
    match index_type {
        1 => GL_UNSIGNED_BYTE,
        2 => GL_UNSIGNED_SHORT,
        4 => GL_UNSIGNED_INT,
        _ => panic!("Unsupported index buffer type!"),
    },
    (index_type as i32 * base_element) as *mut _,
    num_instances,
);
```

The `index_type` field, as a matter of fact is not a "diemnsion". It just contains
the size of the "index" in bytes. This is later used to choose the valid `GL_` constant
for the `glDrawElementsInstanced` call.

## Reflecting on the design

Let's take a step back for a second. I completely understand that for most people this
is an okay and even an "obvious" design. But personally, when I first managed to wrap my 
head around the API only questions were

> * Why is **buffer layout** defined by a  **pipeline**???
> * Why is there **NO** distinction between an Index buffer and Vertex buffer???

This design most likely makes sense when you work with **untyped handles**. Which is
what you get in `miniquad`. All calls return a simple `BufferId`, "points" to your
buffer. Don't forget to memorize its contents! But what if we didn't do that? Could
we even do that? Let's, for a second, assume that we rewrote `miniquad` to use the 
`RAII` style and will work with a smart type called `Buffer`.

In practice, buffers almost never change their roles. If it started its life as an 
Index Buffer, it will probably never be used for storing vertices! So can already make
our first move: instead of one `Buffer` type there will be `VertexBuffer` and
`IndexBuffer`.

In practice, buffers also almost never change their layout. If that buffer was storing
`MyFunnyVertex` since the starts of its lifetime, it most definitely still will.
You can surely write code that does that, but I see very little merit in supporting
that use-case. So we naturally arrive at the idea that our buffers should be **typed
by the vertex type**. We get `VertexBuffer<V>` and `IndexBuffer<I>`. 

These changes will introduce negligible costs, but on return will clean-up the code
and also make it unlikely for us to: 

1. Bind a buffer incorrectly
2. Write incorrect data to the buffer

Morever, since we now know the underlying type, we can also sprinkle some macro
magic to avoid implicit calculations OR boilerplate code, allowing us to create
a cleaner API like this

```rust
let pipeline = ctx.new_pipeline(
    &[
        // Attribute 1
        VertexAttribute::new("in_pos", VertexFormat::Float2),
        // Attribute 2
        VertexAttribute::new("in_color", VertexFormat::Float4),
    ],
    /* other args omitted */
);

bind_pipeline_attributes(bind_buffers![
    // For attribute 1
    (&vertex_buffer) as <MyVertex>::pos,
    // For attribute 2
    (&vertex_buffer) as <MyVertex>::color,
])
```

[^1]: Macroquad [website](https://macroquad.rs/) and [repository](https://github.com/not-fl3/macroquad)
[^2]: Miniquad [doc page](https://docs.rs/miniquad/latest/miniquad/)
[^3]: SDL [website](https://www.libsdl.org/)
[^4]: SFML [website](https://www.sfml-dev.org/)
[^5]: Sokol [GitHub](https://github.com/floooh/sokol)
[^6]: A good short [article](https://thephd.dev/just-put-raii-in-c-bro-please-bro-just-one-more-destructor-bro-cmon-im-good-for-it) about destructors in C
[^7]: Quick explanations about the concept of an index buffer: [here](https://www.opengl-tutorial.org/intermediate-tutorials/tutorial-9-vbo-indexing/) and [here](https://openglbook.com/chapter-3-index-buffer-objects-and-primitive-types.html) 