# Credits

## 3D models

| Asset | File | Author | License | Source |
|---|---|---|---|---|
| Betta Splendens | `public/models/fishes/first-fish.glb` | [BlueMesh](https://sketchfab.com/BlueMesh) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Sketchfab](https://sketchfab.com/3d-models/betta-splendens-f4eeb7f50ad24873842bd954ad27d23b) |
| Tuna | `public/models/fishes/Tuna.glb` | **Unknown** | **Unknown — not verified** | **Unknown** |
| Fish Pack 30 - Coral Bay (30 fish, split into `public/models/fishes/coral-bay/`) | `public/models/fishes/Fish_Pack_30_-_Coral_Bay.glb` | **Unknown** | **Unknown — not verified** | **Unknown** (Sketchfab export, per its generator tag) |
| Đảo ngọc Phú Quốc, Kiên Giang (diorama) | `public/models/landmarks/dao-phu-quoc.glb` | 1DesignTool | [1DesignTool 3D library license](https://1designtool.com/3d/models/dao-phu-quoc): free for commercial use, no attribution required; the file may not be re-sold or re-distributed on its own | [1DesignTool](https://1designtool.com/3d/models/dao-phu-quoc) |
| Lake in the Mountains - Day & Twilight - Skybox | `public/models/fishing-assets/Lake_in_the_Mountains_-_Day_amp_Twilight_-_Skybox.glb` | **Unknown** | **Unknown — not verified** | **Unknown** (Sketchfab export, per its node names; re-exported with glTF-Transform) |
| Fishing Rod (rigged and animated) | `public/models/fishing-assets/Fishing_Rod_Rigged_and_Animated.glb` | **Unknown** | **Unknown — not verified** | **Unknown** (Sketchfab export, per its node names; re-exported with glTF-Transform) |

Attribution (as embedded in the file): "Betta Splendens" by BlueMesh is licensed under CC BY 4.0. Changes by the distributor: cleaned up (centered, grounded, renamed), converted to GLB/FBX/OBJ/BLEND. Distributed by AiZity (https://aizity.com).

Fishora changes: rescaled at runtime, a hidden helper cube disabled, and materials given the tank's underwater shading.

The license information above is taken from the file's embedded glTF metadata.

**Tuna.glb:** the file contains no author, license or source metadata (only the Blender exporter name). It is used for local preview only; its source and license must be confirmed, and attribution added here, before the project is published or distributed.

**Fish Pack 30 - Coral Bay:** like Tuna.glb, the file carries no author, license or source metadata. The split outputs in `coral-bay/` are committed (the raw 247 MB pack stays git-ignored); the source and license must still be confirmed before the project is published or distributed.

## Tank hardscape and plants (Poly Haven, CC0)

Photo-scanned models in `public/models/scape/`, 1k glTF from [Poly Haven](https://polyhaven.com), licensed [CC0](https://creativecommons.org/publicdomain/zero/1.0/) (no attribution required; credited with thanks):
`root_cluster_01`, `single_root`, `dead_quiver_branch_01`, `namaqualand_boulder_05`, `rock_07`, `rock_moss_set_01`, `rock_moss_set_02`, `fern_02`, `anthurium_botany_01`, `moss_01` (downloaded, not yet placed).

Fishora changes: rescaled, tinted darker and given the tank's underwater shading at runtime.

Everything else in the scene is procedural.
