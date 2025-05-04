+++
title = "Project Swarm Devlog (Entry 1)"
template = "article.html"
description = "A start of a new project, written in Rust. Inspired by a single level in a beloved game"
date = 2025-05-03
draft = false
+++

# I am alive!

A lot of things have happened after I posted the [arcanoid blog entry](/blog/rust-arconoid).
Even this GitHub page has been reworked quite a few times for various reasons.
But what good is a programmer or their website when they don't actually do projects?
What good is in the stagnation!

With that said, this the first, long overdue devlog entry for a new project of mine.
Much-much more intricate than a simple arcanoid.

# Inspiration

I played Little Big Planet a lot when I was a kid. Then came Little Big Planet 2
with even more levels for everyone to enjoy! There are quite a few favourites of
mine among the story levels. One of them is the boss in "Eve's Asylum" from the level
called "Invasion of The Body Invader" (skip to 1:51 for the actual boss).

{{ youtube(class="yt-embed", id="mJ9JRI-dPnc", autolpay=false) }}

<!-- TODO: the umlaut is missing -->
That level was amazing. Not only it had ["Vision One" by Royksopp](https://www.youtube.com/watch?v=HNyiTdFKYyI)
playing in the background - there was something captivating about the boss itself!
While even the young me understood that it was technically just a bunch of small
balls, I couldn't help but feel captivated its soft-body like movements as it
danced over the round arena... The level felt short. Almost unjustly so. It made
sense in the scope of the game - it is just a boss. However, I always wanted
more, it felt like this boss idea could have been something a bit more. 
Maybe a whole game? Just on a smaller side, of course.

So here we are. It is 2025 and I can code. Looks like a perfect opportunity to
tap into that childhood dream - this is where "Project Swarm" starts its life!

# Getting started

After writing an arcanoid in macroquad that works in the browser, I found myself
qualified enough to write this game too. It was decided to recycle all of the
code from that game for Project Swarm. Doing that, I immediately ran into a problem -
there was now way whatever had been written was enough for a proper physics simulation.

For that reason, I grabbed what was available "on the market" - `rapier2d`. `rapier2d`
is, together with `rapier3d` part of the rapier framework. It is a fast, advanced physics
engine written entirely in Rust[^1]. It actually already used in quite a few places:
it has a good interop with the Bevy game engine[^2] and the Godot game engine[^3].

However, interfacing with rapier is not an easy task. It is a quite complicated
framework on its own. However, unless you wrote everything with rapier in mind, 
a lot of the stuff needs to be "translated" to make it work. In addition,
extra care needs to be given to not have your code turn into spaghetti. Just look
at the bevy integration source code![^2]

I believe it is more than obvious, that the arcanoid code was never designed with
rapier in mind. Moreover, I didn't really want to have rapier invade the main codebase.
The game logic itself should remain simple and not fall victim to various design decisions
inside the physics engine. In an effort to connect everything nicely, I decided that
some form dependency-injection was in-order. Which brings me to the other large component
inside the game: a lightweight ECS library called [shipyard](https://crates.io/crates/shipyard).

# What's ECS

First of all, ECS is an architectural pattern. As in, it is how group the code. It is
not a silver bullet that solves all possible problems. It is also quite counter-intutive,
so it is okay if you have problems understanding what it is right away. I will give my
best shot at an explanation without any Rust-specific stuff in this section.

I will not dwelve into the technicalities of implementing the tools required for an ECS. 
I will only present the basic mentality I have for ECS, which may also justify why I picked
it over any other programming pattern.

Imagine the way you would most likely write a game object. Unless you are a chronical academic 
or a functional programmer lover, it would be something like this

```c++
class MyCharacter {
private:
    hp: int;
    pos: vector2f,
public:
    Update() { 
        hp += 1 // regeneration 
    }

    Render() { 
        draw_rectangle(pos)
        draw_hp(pos, hp)
    }
    
    Move(delta: vector2) {
        pos += delta
    }
    
    GetHurt(dmg: int) {
        hp -= dmg
        Move(-vector2(-dmg, 0)) // Knockback
    }
}
```

Basically, you would follow these OOP-like principles: the data would be protected and 
tightly coupled with the means of manipulating it. When you are writing an ECS application,
the data and the manipulation means are loosely coupled. To such a degree that you don't
even have them in the same place! Instead you have two large chunks: **storage** and **systems**.

```cpp
class Storage {
private:
    /* Some cool data structure */
public:
    GetHealth() -> int { /* ... */ }
    SetHealth(hp: int) { /* ... */ }

    GetPos() -> vector2 { /* ... */ }
    SetPos(pos: vector2) { /* ... */ }
}

damageSystem(storage: Storage) {
    dmg: int = calculate_damage()
    storage.SetHealth(storage.GetHealth() - dmg)
}
```

In addition, the storage is usually keyd by some value, usually called `EntityId`. Which is
how we can logically group components into a single object. So the code would look more like
this.

```cpp
class Storage {
private:
    /* Some cool data structure */
public:
    GetHealth(who: EntityId) -> int { /* ... */ }
    SetHealth(who: EntityId, hp: int) { /* ... */ }

    GetPos(who: EntityId) -> vector2 { /* ... */ }
    SetPos(who: EntityId, pos: vector2) { /* ... */ }
}
```

So, essentially we get the following architectural principles:

1. Components are small pieces of plain data without any complex invariants
2. Components are grouped into Entities, by associating them with the same EntityId
3. Components are all stored in one big placed, usually refered to as `World`
4. Systems are functions that interact with said `World` and update the data accordingly

This may seem unsafe and over-complicated, but this approach actually leads to a lot of
flexibility and free dependency injection. 

Code written this way doesn't need any sophiscticated observer or subscription systems. 
Everything a piece of logic would have to do is ask the `World` for all entities that 
have HP and what it needs to do. Similarly, any entity that needs to opt-out of that
damage handling stuff just needs to not have that HP component.

It also usually frees you from ending up with 10 different ways/callbacks your game 
handles an object receiving damage or something like that. You write only one function 
that asks "who can I damage" and that's it.

# The prototype

With those tools, I first and foremost added a wrapper around `rapier`. At that point
in time, what I did was implement a special component called `PhysicsInfo`. 

```rust
pub struct PhysicsInfo {
    pub enabled: bool,
    pub groups: InteractionGroups,
    col: ColliderTy,
    body: RigidBodyHandle,
}
```

You can actually see that it is not quite a plain-data component, unlike what I said.
The past me didn't think that it would be a huge problem, but that decision came to bite
me later. I will not dwelve into the design problems in this post though.

What I also did is add a quite complex singleton component called `PhysicsState`. At first
it looked like a good idea, because that allowed to do nice clean calls like `physics.any_collisions`
to test if something collided with a shape. However, that was pretty much it. It was all
the benefits I could reap from going against "keep everything plain data" approach. And it
was yet another footgun waiting to go off.

```rust
pub struct PhysicsState {
    /* Lots and lots of rapier-specific goodness */
}
```

Despite that, I still could ship a rather decent prototype. You can still view the code from
back in time right here at commit [`f942cf0`](https://github.com/InnocentusLime/quad-jam-2024/tree/f942cf0a5626431dd2c3ce7b80ba3f20e385f694). There were several gameplay iterations I went through,
but for now I decided to go with a simple oneshot laser that teleports the only bullet to the other
end of the ray. But who knows! Maybe I will eventually implement the same attack mechanic the orginal
level in Little Big Planet 2 had. The swarm also doesn't behave exactly like it did in the original
either. Will work on that!

{{ youtube(class="yt-embed", id="cxIu8tMEI50", autoplay=false) }}

# What's next?

Good question! I have quite a lot of plans for that small game in fact and this page too!

First of all, I want to actually finish that game and give it a slightly bigger amount of polish
than the arcanoid clone. This time I would like to have the final state of the project have animated
ui and probably a less stellar main menu. I also want to add more variety and a few levels to make
it more like a game and less like a tech-demo. At the same time, moving on to new projects is a 
healthy approach. So the development time will be limitted.

Second of all, while the arcanoid thing was quickly turned into a short "what has been done" report,
I think this project will have a more or less full-fledged devlog. I will reflect on the design
decisions and share my progress as I keep moving forward. However, I also think I still will post 
small things too in order to share random cool findings!

And of course... I will occasionally cleanup the `.css` and the `.html` templates to keep things
fresh looking! You can follow the gamr development closely on GitHub right [here](https://github.com/InnocentusLime/quad-jam-2024).

[^1]: [Official rapier website](https://rapier.rs/)
[^2]: [Crates.io page for the interop](https://crates.io/crates/bevy_rapier2d/)
[^3]: [Godot intergration for rapier](https://godot.rapier.rs/)