from PIL import Image
import numpy as np

img = Image.open("/Users/who/Квиз/telegram-quiz-app/public/elephant_inverted.png").convert("RGBA")
data = np.array(img)

# Create empty arrays for the parts
body = np.zeros_like(data)
leg1 = np.zeros_like(data)
leg2 = np.zeros_like(data)
leg3 = np.zeros_like(data)
leg4 = np.zeros_like(data)

H, W, _ = data.shape

y_split = int(H * 0.58)  # 58% down

for y in range(H):
    for x in range(W):
        pixel = data[y, x]
        if pixel[3] == 0:
            continue
            
        # Trunk is x < 350
        if x < 350:
            body[y, x] = pixel
        elif y < y_split:
            body[y, x] = pixel
        else:
            # We are in the legs area (y >= y_split and x >= 350)
            if 350 <= x < 470:
                leg1[y, x] = pixel
            elif 470 <= x < 610:
                leg2[y, x] = pixel
            elif 610 <= x < 760:
                leg3[y, x] = pixel
            elif 760 <= x < 950:
                leg4[y, x] = pixel
            else:
                body[y, x] = pixel

Image.fromarray(body).save("/Users/who/Квиз/telegram-quiz-app/public/elephant_body.png")
Image.fromarray(leg1).save("/Users/who/Квиз/telegram-quiz-app/public/elephant_leg1.png")
Image.fromarray(leg2).save("/Users/who/Квиз/telegram-quiz-app/public/elephant_leg2.png")
Image.fromarray(leg3).save("/Users/who/Квиз/telegram-quiz-app/public/elephant_leg3.png")
Image.fromarray(leg4).save("/Users/who/Квиз/telegram-quiz-app/public/elephant_leg4.png")
