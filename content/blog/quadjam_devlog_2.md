+++
title = "Project Swarm Devlog (Entry 2)"
template = "article.html"
description = "Resuming the journey of the project and evolving the game design"
date = 2025-05-18
draft = false
+++

# Still alive!

Welcome back to the series when I pretend that I know what I am doing. No
prior knowledge. No proper tooling. No proper engine...

I did some small playtests of the prototype and played the game myself
several times. The results were quite expectable in hindsight.

# Problems

One of the main things that became apparent was that the game was too easy.
It was easy in the worst way possible. Despite the highspeed gameplay, there
was a quite easy way to turn it into simple repeated cycle. That cycle got
only easier to do as the game progressed.

The AI is very easy to abuse. Especially the one that is predictable. 
One of the most abusable AI types is the one that just chases the player. 
The current AI just chases the player. There isn't much to say here.

The enemy had way too many weak spots. The player could have a fairly
good shot from any angle. Which meant that not only they didn't have
to aim, that cycle was very easy to do.

The enemy got easier as its health dropped. As the player hit those
small cells, they eventually disappeared, reducing the overall numbers
of the swarm. Quite obviously, dealing with less threats is easier.

# Pivoting

The main idea is to add a new kind of cell - the "main cell". It will
be in the center of the swarm. In addition that main cell will also
be the only weak spot of the enemy. All other cells become invulnerable.

To see how that main cell would become vulnerable for player to hit,
let us revisit the original Little Big Planet 2 boss.

{{ blogimg(class="big-img-embed", name="bossbulge.jpg") }}

You can see, it kind of stretches out as it goes down. This
causes the main cell (the one with the eye) to be closer to
the edge, than to the center. If we imagine that effect getting
stronger, the main cell will end up poking - exposed!

Another step in that direction is reducing the power of player's
weapon. Instead of a piercing beam, I have replaced it with a
throwable object. It has really basic mechanics for now, but
that is not set in stone.

{{ youtube(class="yt-embed", id="IjY20AjznHU", autoplay=false) }}

I am still experimenting. But I feel like I am slowly approaching
something that feels more and more like a fleshed out game.

# The Refactor

The game code grew quite a lot. In fact it barely resembles what
I have started with. I now have several modules, support for debug 
tools and other cool things. This inevitably leads to several concerns:

* the development will steer towards engine development instead of game development
* the low level parts will get in the way

To cope with this, I did a very simple move: I have split the game
code base into two parts:

* `src`: the game logic
* `lib-game`: the "engine", a box of tools

During development I also bumped into another issue: my ECS
`World` was a formless spaghetti mess. I initially viewed it
as some sort of "plugin & dependency injection platform".
So I stored almost everything in it. From game state to the 
state of the graphics system. This was a bad idea.

The code was reworked. The ECS `World` now contains only the
game related entity data. The rendering system and the physics
system now live outside of it and act as some higher-level things,
that interact with the `World`.

While it was quite easy to do for the rendering system, the physics
engine removal wasn't as easy. It already had its roots quite deep
inside the game logic and in addition, had that annoying `PhysicsInfo`
component.

```rust
pub struct PhysicsInfo {
    pub enabled: bool,
    pub groups: InteractionGroups,
    col: ColliderTy,
    body: RigidBodyHandle,
}
```

One of the main problems was that this one component ruined the whole
idea of the rework. All components can be constructed by the user one
way or the other with no strings attached. However, this component
could only be attached by asking the physics system to do it. This
made it some sort of an outcast, that went against everything else.

Moreover I couldn't just remove the physics system from the ECS world.
It was queried several times by the Game and the ECS world was the only
thing the game had access to by design. However, I eventually found
a way to overcome it. 

I stole the idea from the Godot engine[^1]. The gist of it is that you
can represent your physics queries as object in the game. The object
would be updated by the physics system based off what the query results
into. For example, if you want to have a sensor collider, you can do this:

```rust
world.add_entity((
    Transform {
        pos: vec2(300.0, 300.0),
        angle: 0.0,
    },
    OneSensorTag::new(
        ColliderTy::Box {
            width: 16.0,
            height: 16.0,
        },
        InteractionGroups {
            memberships: groups::LEVEL,
            filter: groups::NPCS,
        },
    ),
    PlayerDamageSensorTag,
));
```

And then the data inside `OneSensorTag` would be initialized
based on what the physics system found.

# Render system?

Earlier, every single entity had its custom rendering code, 
covering all possible needs for rendering that entity. That
was pretty much it and there wasn't much of a "system". However,
such approach did't scale well and also caused me to do annoying 
copy-paste to implement flickering on various objects. Have a look yourself

```rust
 for (_, pos, state, hp) in (&brute, &pos, &state, &hp).iter() {
    if matches!(state, EnemyState::Dead) {
        continue;
    }

    let k = hp.0 as f32 / BRUTE_SPAWN_HEALTH as f32;
    let is_flickering = matches!(state, EnemyState::Stunned { .. });
    let color = if is_flickering && (get_time() * 1000.0) as u32 % 2 == 0 {
        Color::new(0.0, 0.0, 0.0, 0.0)
    } else {
        let mut res = RED;
        res.r *= k;
        res.g *= k;
        res.b *= k;

        res
    };

    draw_circle(
        pos.pos.x,
        pos.pos.y,
        8.0,
        color,
    );
}
```

To avoid copy-paste and also have something easier to use in the future,
I decided to go with a declarative approach. Instead of saying how to draw
a blinking red square, I just submit a request to draw a blinking red
square. The rendering system figures the "how" part later. Simple as that.

```rust
for (_, pos, state) in (&brute, &pos, &state).iter() {
    if matches!(state, EnemyState::Dead) {
        continue;
    }

    let is_flickering = matches!(state, EnemyState::Stunned { .. });
    let r_enemy = render
        .world
        .add_entity((*pos, CircleShape { radius: 6.0 }, Tint(RED)));

    if is_flickering {
        render.world.add_component(r_enemy, Flicker);
    }
}
```

This may look like an overkill. And that because at that stage
it technically is. It isn't really possible to screw up the
code that is just responsible for making objects flicker[^2]

# New additions!

When I was writing the future plans, one of the main features
that I would like to have delivered were the levels. I contemplated
for quite a bit what should the implementation look like. It was
very enticing to just hardcode them in and call it a day. But 
then I realized that I can't do that indefinitely. One day
I really gotta figure out level loading. So I finally decided
that this project is going to be the one.

The level format turned out really simple. I ended up using the
RON[^3] format. I picked it over JSON purely because RON interacts
better with Rust's enum types. The format itself has the following structure

```ron
(
    next_level: NONE or Some(PATH),
    map: MapDef(
        width: INTEGER,
        height: INTEGER,
        tiles: [ TILE ],
    ),
    entities: [ ENTITY ],
)
```

So, for instance, if I want the level to have a `Brute` somewhere, I 
will write

```ron
(
    next_level: ...,
    map: ...,
    entities: [
        Brute((20.0, 40.0)),
    ],
)
```

And this is actually very elegant, because this `Brute` entry
directly maps into the `spawn_brute` function in game's source
code. This makes level loading very straight-forward and simple.

# Conclusion

The game is taking very interesting twists and turns. The road is bumpy.
However, the experience is amazing and I learned a lot.

Though, I keep reminding myself that once I finish tinkering with the
swarm AI, I should go back to the drawing board and figure out the
vision once again. It is time... To take a step back and plan out
the gameplay once again. Time to do a bit more of the game in the
gamedev!

I will make another blog entry once I figure at least 
some game design out.

[^1]: [Godot RayCast2D node](https://docs.godotengine.org/en/stable/classes/class_raycast2d.html)
[^2]: Fun fact: Mario64 devs [messed up](https://www.youtube.com/watch?v=QoU2NKQrQ1Q) while implementing flickering 
[^3]: [RON (Rusty Object Notation)](https://github.com/ron-rs/ron)