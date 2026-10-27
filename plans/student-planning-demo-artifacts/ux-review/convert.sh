#!/bin/zsh
S=/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Genio-playground-malleable-plc-poc/9f0cbd4c-0ede-44d9-98ef-b18f3c7d2260/scratchpad/t12/shots
J=/private/tmp/claude-501/-Users-edward-barnes-glean-co-Code-Genio-playground-malleable-plc-poc/9f0cbd4c-0ede-44d9-98ef-b18f3c7d2260/scratchpad/t12/jpg
full() { sips -s format jpeg -s formatOptions 55 --resampleWidth ${3:-1000} "$S/$1.png" --out "$J/$2.jpg" >/dev/null; }
crop() { # name out h w y x [width]
  cp "$S/$1.png" "$J/tmp.png"
  sips --cropToHeightWidth $3 $4 --cropOffset $5 $6 "$J/tmp.png" >/dev/null
  sips -s format jpeg -s formatOptions 65 --resampleWidth ${7:-800} "$J/tmp.png" --out "$J/$2.jpg" >/dev/null
}
full tour-light-1440-Exam_Prep exam-light
full tour-dark-1440-Exam_Prep exam-dark
crop demo-light-21-review-chip chip-light 300 560 390 400 700
crop var-dark-1440-inlecture chip-dark 300 560 390 400 700
full demo-light-02-empty-board empty-board 800
full demo-light-05-board-built board-built
full demo-light-06-help-me-plan hmp
full demo-light-09-ghost-draft ghost
full demo-light-17-processing-1500 processing 800
full demo-light-29-block-moved moved
full demo-light-26-todo-source-landed landed
full var-light-400-myweek week-400 400
full tour-light-400-Evening_Review tabs-400 400
crop demo-light-28-automation-edited automation 264 448 0 0 448
crop demo-light-32-refit-preview refit 300 360 120 940 360
full demo-light-13-create-popover create-popover
crop explore-click-Activity activity 220 330 0 1115 330
full demo-light-05b-focus-tab3 focus 800
crop demo-light-14-biology-scope scope 160 1300 60 0 1000
rm "$J/tmp.png"
ls -la $J | awk '{s+=$5} END {print s}'
