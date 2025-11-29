+++
title = "Refactoring Miniquad: About Buffers"
template = "article.html"
description = "Reworking a deep dependency of my game"
date = 2025-11-29
draft = false
+++

## Introduction

This article is not about poking fun at `miniquad`[^1]. It is a great library, that
powered several great projects.

This article explores possible ways making the API in miniquad safer and easier to use.
All of the proposed ideas are implement in my 
[own fork of `miniquad`](https://github.com/InnocentusLime/miniquad).

Getting right to the topic: the buffer API. As a quick recap/introduction,
a "buffer" in this context is a chunk of memory in GPU reserved by the graphics
programmer. One of the most common usecases of a buffer is storing infromation
about the vertices to later draw them. Key point is: there is nothing special 
about the buffer on its own. It is just plain bytes, it doesn't have to be
anything specific.

How do we draw stuff from a buffer? Well, this is a long story, but basically
it is dictated by a thing known as a "pipeline". A pipeline consists of "shaders", 
which are small chunks of programs, that run on the GPU. Important! While a pipeline 
describes **the way input buffers is drawn**, it doesn't describe 
**how their contents are laid out**. How a pipeline gets fed the data is determined 
by the graphics programmer before the pipeline runs with special API calls that declare
things like  "positions are located at offset 0" and "colors are located at offset 6".

## Confusing user API

Let's consider the following `miniquad` code example sample. 

```rust
// We create a buffer
let vertex_buffer: BufferId = ctx.new_buffer(
    BufferType::VertexBuffer,
    BufferUsage::Immutable,
    BufferSource::slice(&vertices),
);

// We create a pipeline
let pipeline: PipelineId = ctx.new_pipeline(
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

An act of "giving" a buffer to the pipeline for rendering is called "binding".
This is how it is done in `miniquad`.

```rust
// Later at some point we "use" bindings like this
ctx.apply_pipeline(&pipeline);
ctx.apply_bindings_from_slice(
    &[my_buffer],
    /* other arguments. irrelevant */
);
```

Did you understand how the data is laid out in the buffer? If you are looking
at `miniquad` code for the first time, it might be hard to tell. In fact, even
if you already know some graphics APIs, you will have some trouble figuring
that out. There seem to be no mentions of any offsets at all! The first part 
of the answer lies within the `VertexAttribute` type. Let's have a look at it

```rust
#[derive(Clone, Debug)]
pub struct VertexAttribute {
    pub name: &'static str,
    pub format: VertexFormat,
    pub buffer_index: usize,
    pub gl_pass_as_float: bool,
}

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

But what's `buffer_index`? This is **not** `BufferId` returned by `new_buffer` API.
It is in fact the index into the array of `BufferLayout`s that were provided as the
first argument to `new_pipeline`! So, `VertexAttribute`s "point" at "buffer layouts" 
and get some information from them:

```
BufferLayout0       BufferLayout1
      ↑                   ↑
      │                   │
┌─────┴─────┐       ┌─────┴─────┐
|           |       |           |
Attr1     Attr2    Attr3       Attr4
```

The `BufferLayout` type is not an **actual** buffer.
`BufferLayout` actually describes how to "read" the buffer.

```rust
#[derive(Clone, Debug)]
pub struct BufferLayout {
    // Stride is the starting offset of EACH element
    pub stride: i32,
    // The other two fields are mostly irrelevant,
    // BufferLayout::default() basically describes
    // that we are going to pull one element per vertex
    pub step_func: VertexStep,
    pub step_rate: i32,
}

impl Default for BufferLayout {
    fn default() -> BufferLayout {
        BufferLayout {
            stride: 0,
            step_func: VertexStep::PerVertex,
            step_rate: 1,
        }
    }
}
```

There is also an implicit correlation between the array of `BufferLayout`s
we pass to `new_pipeline` and the one passed to the `apply_bindings_from_slice` call.
A buffer with index `i` in the array from `apply_bindings_from_slice` will be "plugged" 
into `i`th `BufferLayout`. So, we can annotate our code to figure out how the data is
correlated

```rust
let pipeline = ctx.new_pipeline(
    &[
        // Buffer 1 "Slot"
        BufferLayout::default(),
    ],
    &[
        // Buffer in slot 1 has `in_pos` which is a vector of 2 floats
        VertexAttribute::new("in_pos", VertexFormat::Float2),
        // Buffer in slot 1 has `in_color` which is a vector of 4 floats
        VertexAttribute::new("in_color", VertexFormat::Float4),
    ],
    /* other args omitted */
);

ctx.apply_bindings_from_slice(
    &[
        // This buffer goes into Buffer "Slot" 1
        my_buffer,
    ],
    /* other arguments. irrelevant */
);
```

With that part untangled one thing still remains unclear: how does `miniquad`
figure out the offsets of `in_pos` and `in_color` within `my_buffer`? The
answer is that this configuration makes `miniquad` assume that your buffer
will have the following configuration:

```
        vertex1                vertex2                 vertex3
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
| in_pos1 | in_color1 | | in_pos2 | in_color2 | | in_pos3 | in_color3 | ...
```

In other words, `miniquad` assumes the order of attributes matches with
the pipeline declaration one-to-one **and** the data is laid out contigiously.
In case you have some extra data between e.g. `in_color1` and `in_pos2`, you
would have to tune the `stride` field to get the desired result. 

This is quite a mess.

## Buffer internals

There's one more place I would like to show. See, `BufferId` is just a handle.
When you create a buffer, `miniquad` stores some metadata about the buffer,
which is later used during other API calls. Let's take a look at it

```rust
#[derive(Clone, Copy, Debug)]
struct Buffer {
    gl_buf: GLuint,
    buffer_type: BufferType,
    size: usize,
    // (original comment copies from the source code)
    // Dimension of the indices for this buffer,
    // used only as a type argument for glDrawElements and can be
    // 1, 2 or 4
    index_type: Option<u32>,
}
```

Let's go over the fields. `size` is the first obvious one we can throw out of the
picture as it is just the size of the buffer in bytes. `gl_buf` is the next obvious 
candidate as it is just a raw handle for the underlying  OpenGL object. 
`buffer_type` is a two-valued enum that is either `VertexBuffer` or `IndexBuffer` 
and is mostly self-explanatory (especially if you know what "vertex buffers" and "index 
buffers"[^3] are). Basicalyl, a buffer can be of two flavours. 

This leaves us with `index_type`, which is an **optional 32-bit unsigned integer**.
`index_type` is actually only relevant for **index buffers** and describes something
about their elements.  This is why, if you read all other code very carefully, 
it is set to `None` for all  **vertex buffers**. It is still a mystery why the author 
decided to use `Option<u32>` instead of simply setting `index_type` to `0` for 
vertex buffers.

Another peculiar thing is the comment about "dimension of the indices". 
In simplest terms, index buffers are **always** single-dimensional arrays of integers.
So, the comment makes no sense. Perhaps, the the aforementioned `glDrawElements` 
call-site will give us a hint?

```rust
glDrawElementsInstanced(
    primitive_type,
    num_elements,
    match index_type {
        // 1, the size of a byte
        1 => GL_UNSIGNED_BYTE,
        // 2, the size of a short
        2 => GL_UNSIGNED_SHORT,
        // 4, the size of an int
        4 => GL_UNSIGNED_INT,
        _ => panic!("Unsupported index buffer type!"),
    },
    // `index_type` used to multiply `base_element`,
    // like a size of something in bytes.
    (index_type as i32 * base_element) as *mut _,
    num_instances,
);
```

`index_type` is actually, well, the **type of an index**, which is encoded
as the size of said index. No dimentionality here.

## Redoing the buffers

In practice, buffers almost never change their roles. If it started its life as an 
Index Buffer, it will probably never be used for storing vertices! Change number one: 
instead of one `Buffer` type there will be `VertexBuffer` and `IndexBuffer`.

In practice, buffers also almost never change their layout. If that buffer had layout

```
         vertex1                    vertex2 
┌────────────────────────┐ ┌────────────────────────┐ 
| pos1 | color1 | sauce1 | | pos2 | color2 | sauce2 | ...
```

it will almost certainly never change that layout. You may have noticed at this point,
that it is much less mentally taxing to think about the buffer contents as an **array
of structs**. So that same layout above can be described as:

```
vertex1 | vertex2 | vertex3 | ...

where vertexN is

struct MyData {
    pos: vec2
    color: vec4,
    sauce: float,
}

```

It would be nice to be able to tell **by the type** what kind of data either buffer
is storing. Change number two: parametrize both types by the type of their contents,
so we get `VertexBuffer<V>` and `IndexBuffer<I>`. The `I` type parameter on `IndexBuffer` 
removes any need for the arcane `index_type` field, as all required values can be
infered from `I`. Writing data to `VertexBuffer<V>` is also much easier, because
we now know the type of the contents and can introduce the appropriate restrictions.

## Redoing the buffer binding

With the changes from the previous section in place, let's discuss how we can improve
the arguably more messy place: the buffer binding. Anything, that removes this
indexing hierarchy, will improve the situation. 

First of all, let's simplify the context. Let's get rid of per-instance attributes
and stick with per-vertex attributes for the time being. We can immediately notice
a simplification: the pipeline should not dictate **how** the data is laid out
in input buffers. This scheme is very finicky. Let's instead have the pipeline only
list what attributes it has

```rust
// We create a pipeline
let pipeline: PipelineId = ctx.new_pipeline(
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

We can then notice a pattern. When you **bind** a buffer to an attribute, you
sort of specify what **field** of the struct will go into the attribute. We can
use struct size and the `offset_of!` macro the `bytemuck` crate to automatically
figure out things like `stride` and `offset` without putting all of them on the
programmer. If we also employ some Rust's macro magic, we can get the following
API:

```rust
ctx.apply_bindings_from_slice(
    bind_vertex_buffers![
        (&buffer) as <Vertex>::pos,
        (&buffer) as <Vertex>::color,
    ]
    /* other args */
);
```

## Conclusion

We have successfuly refactored the miniquad buffer API to be something
more pleasant, explicit and easier to review. We did sacrifice a little
bit of flexibility, but it might not be not that problematic in the long run.
I will post more updates and discussions as I get through the remaining parts
of `miniquad`. You can track my progress [here](https://github.com/InnocentusLime/miniquad).

```rust
let pipeline: PipelineId = ctx.new_pipeline(
    &[
        VertexAttribute::new("in_pos", VertexFormat::Float2),
        VertexAttribute::new("in_color", VertexFormat::Float4),
    ],
    shader,
    PipelineParams::default(),
);

let vertices = ctx.new_vertex_buffer(BufferUsage::Immutable, &[
    Vertex { pos: vec2(-0.5, -0.5), color: RED },
    Vertex { pos: vec2(0.5, -0.5), color: GREEN },
    Vertex { pos: vec2(0.0,  0.5), color: BLUE },
]);

apply_bindings_from_slice(
    bind_vertex_buffers![
        (&vertices) as <Vertex>::pos,
        (&vertices) as <Vertex>::color,
    ],
    /* args omitted */
);
```

## Future work

This is just the tip of an ice-berg. Another place in need of rectoring
is the pipeline API itself. Right now the API is already much better,
because binding buffers is easier. However, there clearly is room for
improvement. We still have untyped binding arrays instead of well-typed
pipelines, that could enforce compile-time checks.

[^1]: Miniquad [doc page](https://docs.rs/miniquad/latest/miniquad/)
[^2]: Macroquad [website](https://macroquad.rs/) and [repository](https://github.com/not-fl3/macroquad)
[^3]: Quick explanations about the concept of an index buffer: [here](https://www.opengl-tutorial.org/intermediate-tutorials/tutorial-9-vbo-indexing/) and [here](https://openglbook.com/chapter-3-index-buffer-objects-and-primitive-types.html) 