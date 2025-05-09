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

I played Little Big Planet 2 a lot when I was a kid. I loved a lot of levels in that
game. One my favourites was the level called "Invasion of The Body Invaders".
In particular, the boss (skip to 1:51 for the actual boss).

{{ youtube(class="yt-embed", id="mJ9JRI-dPnc", autolpay=false) }}

That level was amazing. Not only it had ["Vision One" by Röyksopp](https://www.youtube.com/watch?v=HNyiTdFKYyI)
playing in the background - there was something captivating about the boss itself!
While even the young me understood that it was technically just a bunch of small
balls, the way it moved and interracted with the level was very fun. The idea of
you fighting this large blob of goo was really fun too!

However, the level felt short, really short, too short. It made
sense in the scope of the game - it is just a boss. But I always wanted
more.

So here we are. It is 2025 and I can code. Looks like a perfect opportunity to
tap into that childhood dream - this is where "Project Swarm" starts its life!

# Getting started

After writing an arcanoid in macroquad that works in the browser, I decided,
that immediately got the competenence to implement my new you idea. 
So I decided to recycle the code for Project Swarm. I immediately ran into a problem -
I needed physics and I really am not a person capable of writing physics simulations.

For that reason, I grabbed what was available "on the market" - `rapier`.
`Rapier` is a fast, advanced physics engine written entirely in Rust[^1]. 
It has a good interop with the Bevy game engine[^2] and the Godot game engine[^3].

However, the word "advanced" has a second side to it. `Rapier` is complicated.
Unless you write everything with rapier in mind beforehand, you will immediately
find yourself writing some sort of wrapper around this monster... And not have
the wrapper itself turn into a monster! 

To cope with the overwhelming complexity and to connect everything nicely, I decided that
some form dependency-injection was in-order. Which brings me to the other large component
inside the game: a lightweight ECS library called [shipyard](https://crates.io/crates/shipyard).

# What's ECS

First of all, ECS is an architectural pattern. It is how you group the code. It is
not a silver bullet that solves all possible problems. Here I will not dwelve into 
the technicalities of implementing the tools required for an ECS. Just the most 
basic understanding. 

Imagine the way you would most likely write a game object. Unless you have chronic 
academicisis or love functional programming, it would be something like this

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

Basically, you would follow these OOP-like principles: 

* The data is protected 
* The data and the means of manipulating it are together in a class

When you are writing an ECS application, the data and the manipulation means 
are loosely coupled. Instead of chunk you have two large chunks: **storage** and **systems**.

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
2. Components are grouped into Entities
3. Components are all stored in one big placed, usually refered to as `World`
4. Systems are functions that interact with said `World` and update the data accordingly

This may seem unsafe and over-complicated, but this approach actually leads to a lot of
flexibility and free dependency injection. Code written this way doesn't need any
sophiscticated observer or subscription systems - everything is in one place and
handled in the same manner. 

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

You can actually see that it is not quite a plain-data component, despite what I said.
The past me didn't think that it would be a huge problem, but that decision came to bite
me later. I will not dwelve into the design problems in this post though.

What I also did is add a quite complex singleton component called `PhysicsState`. At first
it looked like a good idea, because that allowed to do nice clean calls like `physics.any_collisions`
to test if something collided with a shape. However, that is where all the benefits of
going against the "plain-data" rule ended. 

```rust
pub struct PhysicsState {
    /* Lots and lots of rapier-specific goodness */
}
```

Despite that, I still could ship a rather decent prototype. You can still view the code from
back in time right here at commit 
[`f942cf0`](https://github.com/InnocentusLime/quad-jam-2024/tree/f942cf0a5626431dd2c3ce7b80ba3f20e385f694). 
There were several gameplay iterations I went through, but for now I decided to go with a
simple oneshot laser that teleports the only bullet to the other end of the ray. 
Maybe I will implement the same attack mechanic the orginal level in Little Big Planet 2 had. 
This is still under consideration.

{{ youtube(class="yt-embed", id="cxIu8tMEI50", autoplay=false) }}

A small note to add, however. While programming all of that was fun... 
It was hard to ignore that the movement of the "swarm" was nothing like the on in Little
Big Planet! You can see that on the video: the structure of these circles is firm and
brittle. Playing with it is fun too, but it is not what I intended. The current implementation
works like this:

```rust
// Basically, all cells are: 
// 1. pulled towards each other
// 2. pulled towards the player
for enemy in enemies {
    for fella_enemy in enemies {
        enemy.force += (fella_enemy.pos - enemy.pos) * GROUP_FORCE;
    }
    enemy.force += (player_pos - enemy.pos).normalize() * CHASE_FORCE;
}
```

I believe tinkering with the numbers more should help. There's no way this thing
isn't just a bunch of physics-based circles - that I know for sure. Perhaps I also need
to mess around with the "material properties" too. 

# What's next?

Good question! I have quite a lot of plans for that small game and this page too!

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
fresh looking! You can follow the game development closely on GitHub right [here](https://github.com/InnocentusLime/quad-jam-2024).

[^1]: [Official rapier website](https://rapier.rs/)
[^2]: [Crates.io page for the interop](https://crates.io/crates/bevy_rapier2d/)
[^3]: [Godot intergration for rapier](https://godot.rapier.rs/)