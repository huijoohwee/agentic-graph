import type {
  RegionalPoiIdentity,
  RegionalPoiSurface,
} from './regionalPoiGeo.js'

/** Additional Singapore identities with checked-in OpenStreetMap footprints. */
export const SINGAPORE_MAJOR_POI_SUPPLEMENT_IDENTITIES = [
  {
    "id": "national-gallery-singapore",
    "label": "National Gallery Singapore"
  },
  {
    "id": "marina-barrage",
    "label": "Marina Barrage"
  },
  {
    "id": "merlion-park",
    "label": "Merlion Park"
  },
  {
    "id": "suntec-singapore-convention-exhibition-centre",
    "label": "Suntec Singapore Convention & Exhibition Centre"
  },
  {
    "id": "marina-bay-cruise-centre",
    "label": "Marina Bay Cruise Centre"
  },
  {
    "id": "the-shoppes-at-marina-bay-sands",
    "label": "The Shoppes at Marina Bay Sands"
  }
] as const satisfies readonly RegionalPoiIdentity[]

/**
 * Exact source polygons remain the spatial authority. Generated presentation
 * detail is separate and may not change these rings or imply unrecorded height.
 */
export const SINGAPORE_MAJOR_POI_SUPPLEMENT_SURFACES = [
  {
    "id": "national-gallery-singapore:old-city-hall",
    "poiId": "national-gallery-singapore",
    "label": "Old City Hall",
    "category": "civic-cultural",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.8511567,
            1.2902454
          ],
          [
            103.8512518,
            1.2901916
          ],
          [
            103.8514803,
            1.2900623
          ],
          [
            103.8516503,
            1.2899661
          ],
          [
            103.8516918,
            1.2900394
          ],
          [
            103.8517868,
            1.2902071
          ],
          [
            103.8517723,
            1.2902153
          ],
          [
            103.8521369,
            1.2908593
          ],
          [
            103.8521522,
            1.2908507
          ],
          [
            103.8522286,
            1.2909857
          ],
          [
            103.8521069,
            1.2910546
          ],
          [
            103.8517344,
            1.2912654
          ],
          [
            103.8511567,
            1.2902454
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 25.0,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "source-recorded",
      "statement": "The exact source polygon and 25 metre height reproduce OpenStreetMap w 46595597 version 24."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/46595597",
        "sourceUrl": "https://www.openstreetmap.org/way/46595597",
        "sourceVersion": "24",
        "snapshotAt": "2025-06-05T08:08:59Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/46595597",
        "sourceUrl": "https://www.openstreetmap.org/way/46595597",
        "sourceVersion": "24",
        "snapshotAt": "2025-06-05T08:08:59Z"
      },
      "context": [
        {
          "authority": "National Gallery Singapore",
          "sourceId": "national-gallery:architecture-and-history",
          "sourceUrl": "https://www.nationalgallery.sg/sg/en/architecture-and-history.html",
          "sourceVersion": "accessed-2026-10-09",
          "snapshotAt": "2026-10-09T07:50:00Z"
        }
      ]
    }
  },
  {
    "id": "national-gallery-singapore:former-supreme-court",
    "poiId": "national-gallery-singapore",
    "label": "Former Supreme Court",
    "category": "civic-cultural",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.8508169,
            1.2896492
          ],
          [
            103.8509043,
            1.2895778
          ],
          [
            103.8511115,
            1.2894083
          ],
          [
            103.8511191,
            1.2894209
          ],
          [
            103.8512899,
            1.2893252
          ],
          [
            103.851365,
            1.2894562
          ],
          [
            103.8514018,
            1.289525
          ],
          [
            103.8514252,
            1.2895119
          ],
          [
            103.851435,
            1.2895292
          ],
          [
            103.8514474,
            1.2895222
          ],
          [
            103.8514518,
            1.2895297
          ],
          [
            103.8515638,
            1.2897296
          ],
          [
            103.8515691,
            1.2897389
          ],
          [
            103.8515545,
            1.2897471
          ],
          [
            103.8515641,
            1.2897641
          ],
          [
            103.8515426,
            1.2897763
          ],
          [
            103.8515842,
            1.2898473
          ],
          [
            103.8516503,
            1.2899661
          ],
          [
            103.8514803,
            1.2900623
          ],
          [
            103.8514582,
            1.2900254
          ],
          [
            103.8512325,
            1.2901544
          ],
          [
            103.8512518,
            1.2901916
          ],
          [
            103.8511567,
            1.2902454
          ],
          [
            103.8508169,
            1.2896492
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 25.0,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "source-recorded",
      "statement": "The exact source polygon and 25 metre height reproduce OpenStreetMap w 170960936 version 23."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/170960936",
        "sourceUrl": "https://www.openstreetmap.org/way/170960936",
        "sourceVersion": "23",
        "snapshotAt": "2026-09-19T09:08:42Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/170960936",
        "sourceUrl": "https://www.openstreetmap.org/way/170960936",
        "sourceVersion": "23",
        "snapshotAt": "2026-09-19T09:08:42Z"
      },
      "context": [
        {
          "authority": "National Gallery Singapore",
          "sourceId": "national-gallery:architecture-and-history",
          "sourceUrl": "https://www.nationalgallery.sg/sg/en/architecture-and-history.html",
          "sourceVersion": "accessed-2026-10-09",
          "snapshotAt": "2026-10-09T07:50:00Z"
        }
      ]
    }
  },
  {
    "id": "marina-barrage:marina-barrage",
    "poiId": "marina-barrage",
    "label": "Marina Barrage",
    "category": "waterfront-infrastructure",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.8713266,
            1.2805837
          ],
          [
            103.8713934,
            1.2804747
          ],
          [
            103.8714396,
            1.2805089
          ],
          [
            103.871482,
            1.2805408
          ],
          [
            103.8737332,
            1.2822075
          ],
          [
            103.8737022,
            1.2822366
          ],
          [
            103.873603,
            1.2823271
          ],
          [
            103.8735619,
            1.2822828
          ],
          [
            103.8735311,
            1.2822468
          ],
          [
            103.8735796,
            1.2821956
          ],
          [
            103.8734059,
            1.282068
          ],
          [
            103.8733684,
            1.2821194
          ],
          [
            103.8733013,
            1.2820703
          ],
          [
            103.8733389,
            1.2820188
          ],
          [
            103.8731624,
            1.2818893
          ],
          [
            103.8731244,
            1.2819407
          ],
          [
            103.8730573,
            1.2818916
          ],
          [
            103.8730954,
            1.2818401
          ],
          [
            103.8729116,
            1.2817052
          ],
          [
            103.8728733,
            1.2817569
          ],
          [
            103.8728058,
            1.2817075
          ],
          [
            103.8728446,
            1.281656
          ],
          [
            103.8726629,
            1.2815227
          ],
          [
            103.8726244,
            1.2815746
          ],
          [
            103.8725573,
            1.2815255
          ],
          [
            103.8725958,
            1.2814735
          ],
          [
            103.8725083,
            1.2814092
          ],
          [
            103.8724208,
            1.281345
          ],
          [
            103.8723822,
            1.2813974
          ],
          [
            103.8723152,
            1.2813482
          ],
          [
            103.8723538,
            1.2812958
          ],
          [
            103.8721766,
            1.2811658
          ],
          [
            103.8721378,
            1.2812184
          ],
          [
            103.8720696,
            1.2811685
          ],
          [
            103.8721096,
            1.2811166
          ],
          [
            103.8719317,
            1.2809861
          ],
          [
            103.8718927,
            1.2810389
          ],
          [
            103.8718259,
            1.28099
          ],
          [
            103.8718647,
            1.2809369
          ],
          [
            103.8716824,
            1.2808031
          ],
          [
            103.8716432,
            1.2808562
          ],
          [
            103.8715761,
            1.2808071
          ],
          [
            103.8716154,
            1.2807539
          ],
          [
            103.8714275,
            1.2806169
          ],
          [
            103.8713893,
            1.2806703
          ],
          [
            103.8713266,
            1.2805837
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 0.25,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "not-modelled",
      "statement": "The exact source polygon reproduces OpenStreetMap r 18019148 version 3. The source has no verified height; the 0.25 metre display slab is a contact surface, not a height estimate."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:relation/18019148",
        "sourceUrl": "https://www.openstreetmap.org/relation/18019148",
        "sourceVersion": "3",
        "snapshotAt": "2025-02-18T05:51:53Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:relation/18019148",
        "sourceUrl": "https://www.openstreetmap.org/relation/18019148",
        "sourceVersion": "3",
        "snapshotAt": "2025-02-18T05:51:53Z"
      },
      "context": []
    }
  },
  {
    "id": "merlion-park:merlion-park",
    "poiId": "merlion-park",
    "label": "Merlion Park",
    "category": "green-space",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.8535428,
            1.2849296
          ],
          [
            103.8535859,
            1.2849267
          ],
          [
            103.8536347,
            1.2849229
          ],
          [
            103.8538408,
            1.284948
          ],
          [
            103.8538628,
            1.2849507
          ],
          [
            103.8538864,
            1.2849534
          ],
          [
            103.8539466,
            1.2849604
          ],
          [
            103.8544468,
            1.2863666
          ],
          [
            103.8544643,
            1.2863633
          ],
          [
            103.8544549,
            1.2863288
          ],
          [
            103.8544918,
            1.2863227
          ],
          [
            103.8546356,
            1.2866149
          ],
          [
            103.8545575,
            1.2866778
          ],
          [
            103.8545268,
            1.2869656
          ],
          [
            103.8546183,
            1.2869928
          ],
          [
            103.8547581,
            1.286869
          ],
          [
            103.8548277,
            1.2869387
          ],
          [
            103.8546729,
            1.2870799
          ],
          [
            103.8544535,
            1.2870013
          ],
          [
            103.8544248,
            1.286991
          ],
          [
            103.8543984,
            1.2869816
          ],
          [
            103.854118,
            1.2868812
          ],
          [
            103.8540453,
            1.2865435
          ],
          [
            103.8542236,
            1.2865432
          ],
          [
            103.8543616,
            1.286415
          ],
          [
            103.8538967,
            1.2850443
          ],
          [
            103.8535428,
            1.2850476
          ],
          [
            103.8535428,
            1.2850039
          ],
          [
            103.8535428,
            1.2849296
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 0.25,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "not-modelled",
      "statement": "The exact source polygon reproduces OpenStreetMap w 687917300 version 9. The source has no verified height; the 0.25 metre display slab is a contact surface, not a height estimate."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/687917300",
        "sourceUrl": "https://www.openstreetmap.org/way/687917300",
        "sourceVersion": "9",
        "snapshotAt": "2025-06-04T13:36:22Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/687917300",
        "sourceUrl": "https://www.openstreetmap.org/way/687917300",
        "sourceVersion": "9",
        "snapshotAt": "2025-06-04T13:36:22Z"
      },
      "context": []
    }
  },
  {
    "id": "suntec-singapore-convention-exhibition-centre:suntec-singapore-convention-and-exhibition-centre",
    "poiId": "suntec-singapore-convention-exhibition-centre",
    "label": "Suntec Singapore Convention & Exhibition Centre",
    "category": "commercial",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.8563285,
            1.2932547
          ],
          [
            103.8564314,
            1.2931958
          ],
          [
            103.8563607,
            1.2930724
          ],
          [
            103.8563684,
            1.293068
          ],
          [
            103.8564728,
            1.2930082
          ],
          [
            103.8566278,
            1.2929197
          ],
          [
            103.8567152,
            1.2928695
          ],
          [
            103.856845,
            1.2927952
          ],
          [
            103.8569465,
            1.292737
          ],
          [
            103.8570616,
            1.292669
          ],
          [
            103.8571848,
            1.2926005
          ],
          [
            103.8573032,
            1.2925328
          ],
          [
            103.8573623,
            1.292636
          ],
          [
            103.8574844,
            1.2925662
          ],
          [
            103.8575494,
            1.2926798
          ],
          [
            103.857582,
            1.2927364
          ],
          [
            103.8576402,
            1.2928383
          ],
          [
            103.857686,
            1.2929182
          ],
          [
            103.8578186,
            1.2931495
          ],
          [
            103.8579581,
            1.2933931
          ],
          [
            103.8579776,
            1.2934258
          ],
          [
            103.858092,
            1.2936167
          ],
          [
            103.8581556,
            1.2937378
          ],
          [
            103.8580469,
            1.2937969
          ],
          [
            103.8581233,
            1.293925
          ],
          [
            103.8580051,
            1.2939927
          ],
          [
            103.8577793,
            1.2941219
          ],
          [
            103.8577319,
            1.2941491
          ],
          [
            103.8576986,
            1.2941682
          ],
          [
            103.8575387,
            1.2942597
          ],
          [
            103.8574281,
            1.294323
          ],
          [
            103.8573941,
            1.2943425
          ],
          [
            103.8573701,
            1.2943562
          ],
          [
            103.8573342,
            1.2943768
          ],
          [
            103.8573063,
            1.2943928
          ],
          [
            103.8572771,
            1.2944095
          ],
          [
            103.8572313,
            1.2944358
          ],
          [
            103.8571864,
            1.2944615
          ],
          [
            103.8571227,
            1.2943504
          ],
          [
            103.8570867,
            1.294371
          ],
          [
            103.8569974,
            1.2944221
          ],
          [
            103.8569333,
            1.2943104
          ],
          [
            103.8568004,
            1.2940784
          ],
          [
            103.8566653,
            1.2938425
          ],
          [
            103.8565342,
            1.2936138
          ],
          [
            103.8563964,
            1.2933731
          ],
          [
            103.8563285,
            1.2932547
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 0.25,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "not-modelled",
      "statement": "The exact source polygon reproduces OpenStreetMap w 393090489 version 26. The source has no verified height; the 0.25 metre display slab is a contact surface, not a height estimate."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/393090489",
        "sourceUrl": "https://www.openstreetmap.org/way/393090489",
        "sourceVersion": "26",
        "snapshotAt": "2024-10-12T10:31:49Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/393090489",
        "sourceUrl": "https://www.openstreetmap.org/way/393090489",
        "sourceVersion": "26",
        "snapshotAt": "2024-10-12T10:31:49Z"
      },
      "context": []
    }
  },
  {
    "id": "marina-bay-cruise-centre:marina-bay-cruise-centre",
    "poiId": "marina-bay-cruise-centre",
    "label": "Marina Bay Cruise Centre",
    "category": "transit-waterfront",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.859444,
            1.2670383
          ],
          [
            103.8596138,
            1.2668306
          ],
          [
            103.8601466,
            1.2661245
          ],
          [
            103.8601025,
            1.2661082
          ],
          [
            103.8600568,
            1.2661092
          ],
          [
            103.8600112,
            1.2661156
          ],
          [
            103.8609121,
            1.2649011
          ],
          [
            103.8612519,
            1.2651533
          ],
          [
            103.8615955,
            1.2654083
          ],
          [
            103.8606612,
            1.2666078
          ],
          [
            103.8606602,
            1.2665568
          ],
          [
            103.8606484,
            1.2665098
          ],
          [
            103.8606352,
            1.2664802
          ],
          [
            103.8601464,
            1.267211
          ],
          [
            103.8599964,
            1.2674368
          ],
          [
            103.8597901,
            1.2671399
          ],
          [
            103.859444,
            1.2670383
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 0.25,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "not-modelled",
      "statement": "The exact source polygon reproduces OpenStreetMap w 510913018 version 10. The source has no verified height; the 0.25 metre display slab is a contact surface, not a height estimate."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/510913018",
        "sourceUrl": "https://www.openstreetmap.org/way/510913018",
        "sourceVersion": "10",
        "snapshotAt": "2026-04-28T11:11:15Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:way/510913018",
        "sourceUrl": "https://www.openstreetmap.org/way/510913018",
        "sourceVersion": "10",
        "snapshotAt": "2026-04-28T11:11:15Z"
      },
      "context": []
    }
  },
  {
    "id": "the-shoppes-at-marina-bay-sands:the-shoppes-at-marina-bay-sands",
    "poiId": "the-shoppes-at-marina-bay-sands",
    "label": "The Shoppes at Marina Bay Sands",
    "category": "commercial-retail",
    "geometry": {
      "type": "Polygon",
      "coordinates": [
        [
          [
            103.8571588,
            1.282092
          ],
          [
            103.8574096,
            1.2818233
          ],
          [
            103.8577683,
            1.282178
          ],
          [
            103.8581184,
            1.2825722
          ],
          [
            103.8584657,
            1.2830213
          ],
          [
            103.8587703,
            1.2834755
          ],
          [
            103.8592006,
            1.2828215
          ],
          [
            103.8594361,
            1.2830678
          ],
          [
            103.8589379,
            1.2838767
          ],
          [
            103.8592915,
            1.2845887
          ],
          [
            103.8594046,
            1.284858
          ],
          [
            103.8602673,
            1.2841583
          ],
          [
            103.8603489,
            1.2842146
          ],
          [
            103.8603276,
            1.2843133
          ],
          [
            103.8594569,
            1.2850353
          ],
          [
            103.8594954,
            1.2852001
          ],
          [
            103.8596189,
            1.2854642
          ],
          [
            103.8597099,
            1.2855958
          ],
          [
            103.8597684,
            1.2856583
          ],
          [
            103.8598382,
            1.2857005
          ],
          [
            103.8599251,
            1.2857565
          ],
          [
            103.8600299,
            1.2857996
          ],
          [
            103.8601436,
            1.2858126
          ],
          [
            103.8602264,
            1.285811
          ],
          [
            103.8603247,
            1.2857955
          ],
          [
            103.8604076,
            1.2857704
          ],
          [
            103.8604823,
            1.2857379
          ],
          [
            103.8605567,
            1.2857684
          ],
          [
            103.860626,
            1.2860253
          ],
          [
            103.8605261,
            1.2860692
          ],
          [
            103.8604246,
            1.2861041
          ],
          [
            103.8603012,
            1.2861276
          ],
          [
            103.8603108,
            1.2861763
          ],
          [
            103.8602934,
            1.2861888
          ],
          [
            103.8600224,
            1.286217
          ],
          [
            103.8600154,
            1.2861903
          ],
          [
            103.8599958,
            1.2861241
          ],
          [
            103.8599734,
            1.2860673
          ],
          [
            103.8598634,
            1.2860283
          ],
          [
            103.8597746,
            1.2859898
          ],
          [
            103.8596784,
            1.2859344
          ],
          [
            103.8595955,
            1.2858566
          ],
          [
            103.8595214,
            1.2857906
          ],
          [
            103.8594456,
            1.2857027
          ],
          [
            103.8593899,
            1.2856154
          ],
          [
            103.8593405,
            1.2855184
          ],
          [
            103.8593049,
            1.2854133
          ],
          [
            103.8592207,
            1.285126
          ],
          [
            103.8591868,
            1.2850899
          ],
          [
            103.8591569,
            1.2850152
          ],
          [
            103.8591592,
            1.2849578
          ],
          [
            103.8591444,
            1.2849086
          ],
          [
            103.8591311,
            1.2849075
          ],
          [
            103.8590984,
            1.2848421
          ],
          [
            103.8590549,
            1.2847499
          ],
          [
            103.8589782,
            1.2845831
          ],
          [
            103.8589183,
            1.2844561
          ],
          [
            103.8588168,
            1.2842408
          ],
          [
            103.8587387,
            1.2842839
          ],
          [
            103.8583616,
            1.2836008
          ],
          [
            103.8584338,
            1.283561
          ],
          [
            103.8581894,
            1.2832237
          ],
          [
            103.8580073,
            1.2829849
          ],
          [
            103.8579169,
            1.2828664
          ],
          [
            103.857458,
            1.2823297
          ],
          [
            103.8571588,
            1.282092
          ]
        ],
        [
          [
            103.8585983,
            1.2839265
          ],
          [
            103.8585987,
            1.2839347
          ],
          [
            103.8585998,
            1.2839428
          ],
          [
            103.8586016,
            1.2839508
          ],
          [
            103.8586041,
            1.2839586
          ],
          [
            103.8586072,
            1.2839662
          ],
          [
            103.8586108,
            1.2839736
          ],
          [
            103.8586151,
            1.2839806
          ],
          [
            103.85862,
            1.2839872
          ],
          [
            103.8586253,
            1.2839934
          ],
          [
            103.8586312,
            1.2839992
          ],
          [
            103.8586375,
            1.2840044
          ],
          [
            103.8586442,
            1.2840092
          ],
          [
            103.8586513,
            1.2840133
          ],
          [
            103.8586587,
            1.2840169
          ],
          [
            103.8586663,
            1.2840198
          ],
          [
            103.8586742,
            1.2840221
          ],
          [
            103.8586822,
            1.2840238
          ],
          [
            103.8586904,
            1.2840248
          ],
          [
            103.8586986,
            1.2840251
          ],
          [
            103.8587069,
            1.2840248
          ],
          [
            103.8587152,
            1.2840237
          ],
          [
            103.8587234,
            1.284022
          ],
          [
            103.8587314,
            1.2840196
          ],
          [
            103.8587392,
            1.2840165
          ],
          [
            103.8587467,
            1.2840128
          ],
          [
            103.8587538,
            1.2840085
          ],
          [
            103.8587606,
            1.2840036
          ],
          [
            103.8587669,
            1.2839981
          ],
          [
            103.8587728,
            1.2839922
          ],
          [
            103.8587782,
            1.2839857
          ],
          [
            103.8587829,
            1.2839789
          ],
          [
            103.8587871,
            1.2839717
          ],
          [
            103.8587907,
            1.2839641
          ],
          [
            103.8587937,
            1.2839563
          ],
          [
            103.858796,
            1.2839482
          ],
          [
            103.8587976,
            1.28394
          ],
          [
            103.8587985,
            1.2839317
          ],
          [
            103.8587987,
            1.2839234
          ],
          [
            103.8587982,
            1.283915
          ],
          [
            103.8587971,
            1.2839068
          ],
          [
            103.8587952,
            1.2838986
          ],
          [
            103.8587927,
            1.2838906
          ],
          [
            103.8587895,
            1.2838829
          ],
          [
            103.8587857,
            1.2838755
          ],
          [
            103.8587812,
            1.2838684
          ],
          [
            103.8587762,
            1.2838617
          ],
          [
            103.8587707,
            1.2838554
          ],
          [
            103.8587646,
            1.2838497
          ],
          [
            103.8587581,
            1.2838444
          ],
          [
            103.8587512,
            1.2838397
          ],
          [
            103.8587439,
            1.2838356
          ],
          [
            103.8587363,
            1.2838321
          ],
          [
            103.8587285,
            1.2838293
          ],
          [
            103.8587204,
            1.2838271
          ],
          [
            103.8587122,
            1.2838257
          ],
          [
            103.8587038,
            1.2838249
          ],
          [
            103.8586955,
            1.2838248
          ],
          [
            103.8586873,
            1.2838253
          ],
          [
            103.8586792,
            1.2838266
          ],
          [
            103.8586712,
            1.2838285
          ],
          [
            103.8586634,
            1.2838311
          ],
          [
            103.8586558,
            1.2838342
          ],
          [
            103.8586486,
            1.283838
          ],
          [
            103.8586416,
            1.2838424
          ],
          [
            103.858635,
            1.2838473
          ],
          [
            103.8586289,
            1.2838528
          ],
          [
            103.8586232,
            1.2838587
          ],
          [
            103.8586181,
            1.2838651
          ],
          [
            103.8586134,
            1.2838719
          ],
          [
            103.8586094,
            1.283879
          ],
          [
            103.8586059,
            1.2838864
          ],
          [
            103.8586031,
            1.2838941
          ],
          [
            103.8586009,
            1.2839021
          ],
          [
            103.8585993,
            1.2839101
          ],
          [
            103.8585985,
            1.2839183
          ],
          [
            103.8585983,
            1.2839265
          ]
        ]
      ]
    },
    "baseHeightMeters": 0,
    "heightMeters": 15.0,
    "accuracy": {
      "footprint": "source-polygon",
      "height": "source-recorded",
      "statement": "The exact source polygon and 15 metre height reproduce OpenStreetMap r 2298319 version 17."
    },
    "provenance": {
      "geometry": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:relation/2298319",
        "sourceUrl": "https://www.openstreetmap.org/relation/2298319",
        "sourceVersion": "17",
        "snapshotAt": "2024-06-04T05:24:05Z"
      },
      "height": {
        "authority": "OpenStreetMap contributors",
        "sourceId": "openstreetmap:relation/2298319",
        "sourceUrl": "https://www.openstreetmap.org/relation/2298319",
        "sourceVersion": "17",
        "snapshotAt": "2024-06-04T05:24:05Z"
      },
      "context": []
    }
  }
] as const satisfies readonly RegionalPoiSurface[]
