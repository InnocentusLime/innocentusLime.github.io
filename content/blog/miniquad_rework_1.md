+++
title = "Refactoring Miniquad: About Buffers"
template = "article.html"
description = "Reworking a deep dependency of my game"
date = 2025-11-29
draft = false
+++

## Introduction

This article is not for poking fun at the author of `miniquad`[^1]. Not only it is a
great library that was used in several projects - it also became the heart of another
great library known as `macroquad`[^2], that fueled even **more** projects! 

With that said, just like `macroquad`, `miniquad` has its own short-comings that will
be discussed in these series. They will also present alternative solutions, that I will
implement in my [own fork of `miniquad`](https://github.com/InnocentusLime/miniquad).

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

// Later at some point we "use" bindings like this
ctx.apply_pipeline(&pipeline);
ctx.apply_bindings_from_slice(
    &[my_buffer],
    /* other arguments. irrelevant */
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

// Later at some point we "use" bindings like this
ctx.apply_pipeline(&pipeline);
ctx.apply_bindings_from_slice(
    &[
        // This buffer goes into Buffer "Slot" 1
        my_buffer,
    ],
    /* other arguments. irrelevant */
);
```

The question is: *how does miniquad now the offsets of `in_pos` and `in_color` inside
the buffer we are later going to provide*? Take a good pause and think about it.

If your answer is a list of the following bullet points:

* `miniquad` implicitly assumes that `in_pos` is at offset zero
* `miniquad` implicitly assumes that `in_color` is right after `in_pos`

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

* Why is **buffer layout** defined by a  **pipeline**???
* Why is there **NO** distinction between an Index buffer and Vertex buffer???

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

ctx.apply_bindings_from_slice(
    &bind_buffers![
        // For attribute 1
        (&vertex_buffer) as <MyVertex>::pos,
        // For attribute 2
        (&vertex_buffer) as <MyVertex>::color,
    ],
    /* other arguments. irrelevant */
);
```

## Implementing the types

Using the GL-on-whatever (glow) library[^8] and bytemuck[^9] we can put together
the following type

```rust
#[derive(Debug, Clone)]
pub struct VertexBuffer<T: Pod + Default> {
    ctx: Rc<glow::Context>,
    gl_buf: glow::Buffer,
    _phantom: PhantomData<&'static [T]>,
}

// BufferInternal's drop will be called when the reference
// count reaches zero.
impl<T: Pod + Default> Drop for VertexBuffer<T> {
    fn drop(&mut self) {
        unsafe {
            self.ctx.delete_buffer(self.gl_buf);
        }
    }
}
```

Thanks to the `Pod` trait we can enforce that `T` can be continiously laid
out in memory without any holes. That means we can feed it as bytes to the
OpenGL API. As a result we can implement a constructor as follows:

```rust
pub fn new(ctx: Rc<glow::Context>, usage: u32, data: &[T]) -> VertexBuffer<T> {
    let data: &[u8] = bytemuck::cast_slice(data);
    let gl_buf = unsafe { ctx.gl.create_buffer().unwrap() };
    unsafe {
        ctx.bind_buffer(glow::ARRAY_BUFFER, Some(gl_buf));
        ctx.buffer_data_u8_slice(glow::ARRAY_BUFFER, data, usage);
    }
    VertexBuffer {
        ctx,
        gl_buf,
        _phantom: PhantomData,
    }
}
```

With that typed API sorted out the only thing left to do is to figure out
the **binding buffer to an attribute**. Unfortunately, our `VertexBuffer`
abstraction is missing **one crucial part** for doing that - the starting offset.
There are many ways to get around that. I decided to create a separate type
for representing a binding.

```rust
impl<T: Pod + Default> VertexBuffer<T> {
    pub fn binding(&self, offset: u32) -> VertexBufferBinding<'_> {
        VertexBufferBinding {
            gl_buf: self.gl_buf,
            offset,
            // Since our buffer contents are structs, the stride
            // here is always just the size of T
            stride: std::mem::size_of::<T>() as u32,
            _phantom: PhantomData,
        }
    }
}

// Note that this type is "untyped". This frees us from
// doing any ultra-sophisticated generic code in `apply_bindings`.
#[derive(Debug, Clone, Copy)]
pub struct VertexBufferBinding<'a> {
    pub(crate) gl_buf: glow::Buffer,
    pub(crate) offset: u32,
    pub(crate) stride: u32,
    // This `PhantomData` is really important.
    // Not only it allows us to use the lifetime 'a,
    // but it also enables us to make the Rust compiler
    // treat this type as a reference to our buffer.
    // This way the values in this type can't be used
    // after the buffer is dropped.
    _phantom: PhantomData<&'a glow::Buffer>,
}
```

This way we get the following API for binding a buffer

```rust
// Note that this API allows us to bind parts of buffer with
// arbitrary offsets, unlike the original miniquad API.
ctx.apply_bindings_from_slice(
    &[
        // For attribute 1
        &vertex_buffer.binding(0),
        // For attribute 2
        &vertex_buffer.binding(24),
    ],
    /* other arguments. irrelevant */
);
```

Of course, writing out offsets by hand is annoying and error-prone.
We can, however, observe that all of those offsets correspond to a
**field offset inside T**. Thankfully, getting a field offset is a
feature already present in `bytemuck`. This way, we can quickly put
together the following macros

```rust
// General macro for consuming a LIST of bindings of form
//
//  (buffer_reference) as <ELEMENT_TYPE>::field_name
//
// Returns a list of `VertexBufferBinding`. For more info see
// the `bind_vertex_buffer` macro.
#[macro_export]
macro_rules! bind_vertex_buffers {
    (
        $(
            ($buf:expr) as <$Type:path>::$field:tt
        ),+
        $(,)?
    ) => {
        [$(
            $crate::bind_vertex_buffer!($buf, $Type, $field)
        ),+]
    };
    () => { [] }
}

#[macro_export]
macro_rules! bind_vertex_buffer {
    ($buf:expr, $Type:path, $field:tt) => {{
        // Create a local variable with an explicit type.
        // Technically this is no-op, but it lets us to assert the type
        // of the buffer early.
        let local: &VertexBuffer<$Type> = $buf;
        // We now simply call `bytemuck::offset_of!`, which works for all
        // types that implement `Pod + Default`.
        local.binding(bytemuck::offset_of!($Type, $field) as u32)
    }};
}
```

## Conclusion

We have successfuly refactored the miniquad buffer API to be something
more pleasant, explicit and easier to review. We did sacrifice a little
bit of flexibility, but it might not be not that problematic in the long run.
I will post more updates and discussions as I get through the remaining parts
of `miniquad`. You can track my progress [here](https://github.com/InnocentusLime/miniquad).

## Appendix: why bytemuck?

Miniquad actually uses its own mechanism for passing around raw data into
the buffer. It's called `Arg<'a>` and is defined like this

```rust
/// A vtable-erased generic argument.
/// Basically, the same thing as `fn f<U>(a: &U)`, but
/// trait-object friendly.
pub struct Arg<'a> {
    ptr: *const std::ffi::c_void,
    element_size: usize,
    size: usize,
    is_slice: bool,
    _phantom: std::marker::PhantomData<&'a ()>,
}
```

The new solution, as you could see, doesn't use `Arg` anywhere. This is becase
`Arg` has several problems that `bytemuck` doesn't 

* The documentation never mentions that the type you get `Arg` from **must**
  be `#[repr(C)]`. `bytemuck` documents that pretty clearly.
* The interface of `miniquad` never tries to enforce that. `bytemuck` enforces
  all of that via its `derive` macros.
* `Arg` is somewhat obscure and not well supported, plus it adds pressure on me
  as the developer. `bytemuck` is a separate dependency with more recognition
  in the Rust community, plus some crates have integration with it.

[^1]: Miniquad [doc page](https://docs.rs/miniquad/latest/miniquad/)
[^2]: Macroquad [website](https://macroquad.rs/) and [repository](https://github.com/not-fl3/macroquad)
[^3]: SDL [website](https://www.libsdl.org/)
[^4]: SFML [website](https://www.sfml-dev.org/)
[^5]: Sokol [GitHub](https://github.com/floooh/sokol)
[^6]: A good short [article](https://thephd.dev/just-put-raii-in-c-bro-please-bro-just-one-more-destructor-bro-cmon-im-good-for-it) about destructors in C
[^7]: Quick explanations about the concept of an index buffer: [here](https://www.opengl-tutorial.org/intermediate-tutorials/tutorial-9-vbo-indexing/) and [here](https://openglbook.com/chapter-3-index-buffer-objects-and-primitive-types.html) 
[^8]: GL on whatever [doc page](https://docs.rs/glow/latest/glow/)
[^9]: bytemyck [doc page](https://docs.rs/bytemuck/latest/bytemuck/)