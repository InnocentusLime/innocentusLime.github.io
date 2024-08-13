function render_projects(data) {
    const card = document.querySelector("template#project-card");
    if (card === null) {
        throw new Error("Found no card template");
    }

    const container = document.querySelector(".project-grid");
    if (container === null) {
        throw new Error("Found no container to put project cards into");
    }


    for (const proj of data) {
        console.log("Spawning ", proj.title);
        const spawn = card.content.cloneNode(true);

        /* href */
        const anchor = spawn.querySelector(".project");
        anchor.setAttribute("href", proj["url"]);

        /* Img */
        const img = spawn.querySelector(".project-image");
        img.setAttribute("src", proj["img_src"]);
        img.setAttribute("alt", proj["title"] + " logo");

        /* Project info */
        const name = spawn.querySelector(".project-name");
        name.textContent = proj["title"];
        const desc = spawn.querySelector(".project-description");
        desc.textContent = proj["description"];

        container.appendChild(spawn);
    }
}

fetch("/data/projects.json").then(function(result) {
    return result.json();
}).then(function (data) {
    console.log("Loaded content:\n", data);
    render_projects(data);
}).catch(function (err) {
    console.error("Failed to load project page: ", err);
})