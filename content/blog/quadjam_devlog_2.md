+++
title = "Project Swarm Devlog (Entry 2)"
template = "article.html"
description = "Resuming the journey of the project and evolving the game design"
date = 2025-05-18
draft = false
+++

# Still alive!

<!-- ALT: a series where I pretend that I know what I am doing -->
Welcome back. This is part 2 of the devlog where a fool decided to make a physics
based game right after making a simple arcanoid. Without any prior knowledge.
Without any proper tooling. Without a proper engine.

I did some small playtests of the prototype. In addition I played the game myself
several times to see how the gameplay evolves for me. Some things were expected. 
Some were not. Let us go through what I have learned!

# The challenge

One of the playtesters noted very fairly so: the challenge got easier
as they hit enemy. Which in retrospect made sense. The player has
the ability to melt the cells away, making the swarm smaller. 
Obviously, when the swarm gets smaller - it becomes much easier to dodge.

Another thing that was pointed out is that the enemy AI is very easy
to abuse. Going in circles very quickly rendered the swarm unable
to fight back in any way! Surprisingly, the bullet teleporting to
the other side of the laser beam that the player shot did not
affect the gameplay too much.

Finally, it turned out that the playtesters weren't really enthusiastic
about the score and more focused on beating the monster.

# Pivoting

The problems were very apparent. While the enemy is big, it is
easily hittable from any side (and from any position). While there
technically are many "parts" to it, they melt off extremely fast.

The change I came up as a foundation, was super simple. Make
everyone invulnerable!... Except one central "cell", that would
be normally hiding in the middle of the swarm.

# But how...

A quite fair would arise: if all surrounding cells are invulnerable,
then how would the player do any damage? To understand this idea,
let's revisit the Little Big Planet 2 boss.

{{ blogimg(class="big-img-embed", name="bossbulge.jpg") }}

You can see, that it kind of stretches out as it goes down. This
causes the main "cell" (the one with the eye) to be closer to
the edge, than to the center. If we imagine that effect getting
stronger, the main cell will end up poking - exposed!

This exact effect is the key to the answer. The player will have
to wait out for an opening to strike the main cell at the right
time!

To support this sort of mechanic, I had to update the main AI
to not move at a constant speed. The reason for that is that so
the main cell could get some protection. In addition, I also
messed around with the physics parameters of rapier to get more
of that "fluid" effect. Here is what it looks like right now:

{{ youtube(class="yt-embed", id="IjY20AjznHU", autoplay=false) }}

As you can see, another change was made to player's laser. It
is now a throwable object instead of a piercing beam! Which makes 
getting hits slightly more challenging.

I am still experimenting. But I feel like I am slowly approaching
something that feels more and more like a fleshed out game.

# The bite

Remember I mentioned in part 1, that the following definition in
my code would come back and bite me? It did and I had a very bad
time when removing all of the intertwined components.

```rust
pub struct PhysicsInfo {
    pub enabled: bool,
    pub groups: InteractionGroups,
    col: ColliderTy,
    body: RigidBodyHandle,
}
```

I ended up moving **all** of the subsystems out of the game `World`,
leaving only the relevant state there. That included the physics
properties and its "state". The reason for that was a shift in the
vision. For quite a while I viewed physics engine stuff as an
essential part of game state. However, it is now considered to be
a mere subsystem that just updates some object positions.

# Rendering...

The rendering system got a small rework too. Earlier, every single
entity had its custom rendering code, covering all possible needs
for rendering that entity. That approach doesn't scale well and
also caused me to have an annoying code duplication to implement
flickering. Have a look yourself

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
code that is just responsible for making objects flicker[^1]

# New additions!

When I was writing the future plans, one of the main features
that I would like to have delivered were the levels. I contemplated
for quite a bit what should the implementation look like. It was
very enticing to just hardcode them in and call it a day. But 
then I realized that I can't do that indefinitely. One day
I really gotta figure out level loading. So I finally decided
that this project is going to be the one.

The level format turned out really simple. I ended up using the
RON[^2] format. I picked it over JSON purely because RON interracts
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

So, for instance, if I the level to have a `Brute` somewhere, I 
would write

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

# A fear

The game code grew quite a lot. In fact it barely resembles what
I have started with. I now have several modules, support
for debug tools and other cool things. Every time I see a project
of mine grow in complexity, I get one and only one concern: a risk
of entering an infinite "engine development" pursuit instead of a
proper game development. 

What helped me personally was a drawing a clear line between what
counts as an engine and what counts as the actual game. Basically,
the game got split into two parts: `src` and `lib-game`.

`src` is where the game logic lives. It hosts things like the player
controls, enemy AI and the descriptions of how the entities are rendered.

`lib-game` is the engine. It is a box of all the tools that on their
own don't provide any sort of gameplay and is usually set aside. It
is modified only when it is absolutely necessary.

# Conclusion

The game is taking very interesting twists and turns. The road is bumpy.
However, the experience is amazing and I learned a lot.

Though, I keep reminding myself that once I finish tinkering with the
swarm AI, I should go back to the drawing board and figure out the
vision once again. Clearly, the idea has changed. The pivoting
needs clarifications. With proper reflection, I will have a more
clear plan on how to pave the way towards a finished project.

[^1]: fun fact. The Mario 64 devs did just that
[^2]: RON -- Rusty Object Notation